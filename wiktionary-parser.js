function getTemplate(wikitext, templateName) {
    const regex = new RegExp(
        `\\{\\{${templateName}([\\s\\S]*?)\\}\\}`,
        "i"
    );

    const match = wikitext.match(regex);

    if (!match) {
        return null;
    }

    const content = match[1];
    const fields = {};

    content.split("|").forEach((part) => {
        const separator = part.indexOf("=");

        if (separator === -1) {
            return;
        }

        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();

        fields[key] = value;
    });

    return fields;
}


function cleanText(text) {
    if (!text) {
        return "";
    }

    return text
        .replace(/\{\{K\|[^|}]+(?:\|[^}]*)?\}\}/g, "")
        .replace(/\{\{[^{}]*\}\}/g, "")
        .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/'''?/g, "")
        .replace(/''/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
}


function extractLabels(text) {
    const labels = [];

    const regex =
        /\{\{K\|([^|}]+)(?:\|[^}]*)?\}\}/g;

    let match;

    while ((match = regex.exec(text)) !== null) {
        labels.push(match[1].trim());
    }

    return labels;
}


function extractPronunciation(wikitext) {
    const pronunciationMatch = wikitext.match(
        /\{\{Aussprache\}\}([\s\S]*?)(?=\n\{\{Bedeutungen\}\})/i
    );

    if (!pronunciationMatch) {
        return null;
    }

    const section = pronunciationMatch[1];

    const ipaRegex =
        /\{\{Lautschrift\|([^}|]+)(?:\|[^}]*)?\}\}/g;

    const pronunciations = [];

    let match;

    while ((match = ipaRegex.exec(section)) !== null) {
        const ipa = match[1].trim();

        if (ipa && ipa !== "…") {
            pronunciations.push(ipa);
        }
    }

    if (pronunciations.length === 0) {
        return null;
    }

    return pronunciations;
}


function extractExamples(wikitext) {
    const examples = {};

    const examplesMatch = wikitext.match(
        /\{\{Beispiele\}\}([\s\S]*?)(?=\n\{\{|\n===|\n==|$)/i
    );

    if (!examplesMatch) {
        return examples;
    }

    const section = examplesMatch[1];

    const lines = section
        .split("\n")
        .map((line) => line.trim());

    lines.forEach((line) => {
        const match = line.match(
            /^:\[(\d+)\]\s*(.*)$/
        );

        if (!match) {
            return;
        }

        const number = match[1];
        const example = cleanText(match[2]);

        if (!example) {
            return;
        }

        if (!examples[number]) {
            examples[number] = [];
        }

        if (examples[number].length < 3) {
            examples[number].push(example);
        }
    });

    return examples;
}


function extractTranslations(wikitext) {
    const translations = {
        english: [],
        russian: []
    };

    const languageMap = {
        en: "english",
        ru: "russian"
    };

    // Translation templates in German Wiktionary use forms such as
    // {{Ü|en|give}} and {{Ü|ru|давать}}. Collecting them from the German
    // section keeps the data tied to the entry currently being viewed.
    const translationRegex =
        /\{\{Ü(?:t)?\|(en|ru)\|([^|}]+)/gi;

    let match;

    while ((match = translationRegex.exec(wikitext)) !== null) {
        const language = languageMap[match[1].toLowerCase()];
        const translation = cleanText(match[2]);

        if (translation && !translations[language].includes(translation)) {
            translations[language].push(translation);
        }
    }

    return translations;
}


function extractBaseForm(wikitext) {
    const match = wikitext.match(
        /\{\{Grundformverweis(?:\s+(?:Dekl|Konj))?\|([^|}]+)/i
    );

    return match ? cleanText(match[1]) : null;
}


function parseWord(wikitext, word) {
    const result = {
        word: word,
        level: null,
        partOfSpeech: null,
        pronunciation: null,
        translations: {
            english: [],
            russian: []
        },
        baseForm: extractBaseForm(wikitext),
        meanings: [],
        verb: null
    };


    // wortart

    const wortartMatch = wikitext.match(
        /\{\{Wortart\|([^|]+)\|Deutsch/
    );

    if (wortartMatch) {
        result.partOfSpeech = cleanText(
            wortartMatch[1]
        );
    }


    // verb forms

    const verbTemplate = getTemplate(
        wikitext,
        "Deutsch Verb Übersicht"
    );

    if (verbTemplate) {
        result.verb = {
            present: {
                ich: cleanText(
                    verbTemplate["Präsens_ich"]
                ),

                du: cleanText(
                    verbTemplate["Präsens_du"]
                ),

                erSieEs: cleanText(
                    verbTemplate["Präsens_er, sie, es"]
                )
            },

            preterite: cleanText(
                verbTemplate["Präteritum_ich"]
            ),

            perfect: cleanText(
                verbTemplate["Partizip II"]
            ),

            konjunktivII: cleanText(
                verbTemplate["Konjunktiv II_ich"]
            ),

            imperativeSingular: cleanText(
                verbTemplate["Imperativ Singular"]
            ),

            imperativePlural: cleanText(
                verbTemplate["Imperativ Plural"]
            ),

            auxiliary: cleanText(
                verbTemplate["Hilfsverb"]
            )
        };
    }


    // pronunciation

    const pronunciation = extractPronunciation(
        wikitext
    );

    if (pronunciation) {
        result.pronunciation = pronunciation;
    }


    // german section

    const germanSectionMatch = wikitext.match(
        /==\s*[^=\n]*\{\{Sprache\|Deutsch\}\}[^=\n]*==([\s\S]*)/i
    );

    if (germanSectionMatch) {
        const germanSection = germanSectionMatch[1];

        const examples = extractExamples(
            germanSection
        );

        result.translations = extractTranslations(
            germanSection
        );


        // meanings

        const meaningsMatch = germanSection.match(
            /\{\{Bedeutungen\}\}([\s\S]*?)(?=\n\{\{|\n===|\n==|$)/i
        );

        if (meaningsMatch) {
            const lines = meaningsMatch[1]
                .split("\n")
                .map((line) => line.trim())
                .filter((line) =>
                    /^:\[\d+\]/.test(line)
                );

            result.meanings = lines.map((line) => {
                const match = line.match(
                    /^:\[(\d+)\]\s*(.*)$/
                );

                const number = match[1];

                return {
                    number: number,
                    definition: cleanText(match[2]),
                    labels: extractLabels(match[2]),
                    examples: examples[number] || []
                };
            });
        }
    }


    return result;
}


module.exports = {
    parseWord
};

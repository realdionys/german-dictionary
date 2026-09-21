const express = require("express");
const { parseWord } = require("./wiktionary-parser");

const app = express();
const port = 3000;
const pageCache = new Map();
const cacheLifetime = 5 * 60 * 1000;

app.use(express.static(__dirname));

function buildSearchCandidates(word) {
    const normalizedWord = word.normalize("NFC").trim();
    const candidates = new Set([
        normalizedWord,
        normalizedWord.toLocaleLowerCase("de-DE"),
        normalizedWord.charAt(0).toLocaleUpperCase("de-DE") +
            normalizedWord.slice(1).toLocaleLowerCase("de-DE")
    ]);

    const replacements = [
        ["ae", "ä"],
        ["oe", "ö"],
        ["ue", "ü"],
        ["ss", "ß"]
    ];

    replacements.forEach(([plain, umlaut]) => {
        [...candidates].forEach((candidate) => {
            if (candidate.toLocaleLowerCase("de-DE").includes(plain)) {
                candidates.add(
                    candidate.replace(new RegExp(plain, "gi"), umlaut)
                );
            }
        });
    });

    // Also accept a missing umlaut, e.g. "hubsch" → "hübsch".
    // Limit the generated alternatives to keep requests inexpensive.
    [...candidates].forEach((candidate) => {
        const positions = [...candidate.matchAll(/[aou]/gi)]
            .map((match) => match.index)
            .slice(0, 4);

        for (let mask = 1; mask < 2 ** positions.length; mask += 1) {
            const letters = [...candidate];

            positions.forEach((position, index) => {
                if (mask & (1 << index)) {
                    const letter = letters[position];
                    const umlauts = { a: "ä", o: "ö", u: "ü" };
                    letters[position] = umlauts[letter.toLowerCase()];
                }
            });

            candidates.add(letters.join(""));
        }
    });

    return [...candidates].filter(Boolean).slice(0, 12);
}

async function fetchWiktionaryPage(page) {
    const cacheKey = page.normalize("NFC").toLocaleLowerCase("de-DE");
    const cachedPage = pageCache.get(cacheKey);

    if (cachedPage && Date.now() - cachedPage.createdAt < cacheLifetime) {
        return cachedPage.data;
    }

    const url =
        "https://de.wiktionary.org/w/api.php?" +
        new URLSearchParams({
            action: "parse",
            page,
            prop: "wikitext",
            format: "json",
            formatversion: "2"
        });

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "GermanLearnersDictionary/0.1 (educational project)"
                }
            });

            if (!response.ok) {
                throw new Error(`Wiktionary returned ${response.status}`);
            }

            const data = await response.json();

            pageCache.set(cacheKey, {
                data,
                createdAt: Date.now()
            });

            return data;
        } catch (error) {
            if (attempt === 2) {
                return { error: "wiktionary request failed" };
            }

            await new Promise((resolve) => setTimeout(
                resolve,
                500 * (attempt + 1)
            ));
        }
    }
}

async function parseWiktionaryEntry(data) {
    let parsedWord = parseWord(
        data.parse.wikitext,
        data.parse.title
    );

    if (!parsedWord.baseForm || parsedWord.baseForm === parsedWord.word) {
        return parsedWord;
    }

    const baseFormData = await fetchWiktionaryPage(parsedWord.baseForm);

    if (!baseFormData.error) {
        parsedWord = parseWord(
            baseFormData.parse.wikitext,
            baseFormData.parse.title
        );
    }

    return parsedWord;
}

app.get("/api/word/:word", async (req, res) => {
    const word = req.params.word.trim();
    const exactMatch = req.query.exact === "1";

    try {
        const candidates = exactMatch
            ? [word]
            : buildSearchCandidates(word);
        const entriesByTitle = new Map();
        const checkedCandidates = new Set();
        let sourceUnavailable = false;

        async function addEntry(candidate) {
            const key = candidate
                .normalize("NFC")
                .toLocaleLowerCase("de-DE");

            if (checkedCandidates.has(key)) {
                return;
            }

            checkedCandidates.add(key);

            const data = await fetchWiktionaryPage(candidate);

            if (data.error) {
                if (data.error === "wiktionary request failed") {
                    sourceUnavailable = true;
                }
                return;
            }

            const entry = await parseWiktionaryEntry(data);
            const titleKey = entry.word.toLocaleLowerCase("de-DE");

            if (!entriesByTitle.has(titleKey)) {
                entriesByTitle.set(titleKey, entry);
            }
        }

        await addEntry(candidates[0]);

        if (!exactMatch) {
            const hasExactEntry = entriesByTitle.size > 0;
            const alternatives = hasExactEntry
                ? candidates.slice(1).filter((candidate) => /[äöüß]/i.test(candidate))
                : candidates.slice(1);

            for (const candidate of alternatives) {
                await addEntry(candidate);
            }
        }

        const entries = [...entriesByTitle.values()];

        if (entries.length === 0) {
            return res.status(sourceUnavailable ? 502 : 404).json({
                error: sourceUnavailable
                    ? "Wiktionary is temporarily unavailable"
                    : "word not found"
            });
        }

        if (!exactMatch && entries.length > 1) {
            return res.json({
                type: "choices",
                query: word,
                choices: entries.map((entry) => ({
                    word: entry.word,
                    partOfSpeech: entry.partOfSpeech,
                    definition: entry.meanings[0]?.definition || "",
                    translations: entry.translations
                }))
            });
        }

        res.json(entries[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "server error"
        });
    }
});

app.listen(port, () => {
    console.log(
        `server running at http://localhost:${port}`
    );
});

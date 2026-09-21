const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const result = document.getElementById("result");
let searchInProgress = false;


form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const word = input.value.trim();

    if (!word) {
        return;
    }

    await searchWord(word);
});

document.querySelectorAll(".example-query").forEach((button) => {
    button.addEventListener("click", () => {
        searchWord(button.dataset.word);
    });
});


async function searchWord(word, exactMatch = false) {
    if (searchInProgress) {
        return;
    }

    searchInProgress = true;
    input.value = word;

    result.innerHTML = `
        <div class="status-message">
            <span class="loading-dot" aria-hidden="true"></span>
            <p>Looking up <strong>${escapeHtml(word)}</strong>…</p>
        </div>
    `;

    try {
        const response = await fetch(
            `/api/word/${encodeURIComponent(word)}${
                exactMatch ? "?exact=1" : ""
            }`
        );

        const data = await response.json();

        if (!response.ok) {
            result.innerHTML = `
                <div class="status-message error-message">
                    <p>${
                        response.status >= 500
                            ? "Wiktionary is temporarily unavailable. Please try again in a moment."
                            : `We couldn't find <strong>${escapeHtml(word)}</strong>. Check the spelling and try again.`
                    }</p>
                </div>
            `;
            return;
        }

        if (data.type === "choices") {
            renderChoices(data);
        } else {
            renderWord(data);
        }

    } catch (error) {
        console.error(error);

        result.innerHTML = `
            <div class="status-message error-message">
                <p>Something went wrong. Please try again in a moment.</p>
            </div>
        `;
    } finally {
        searchInProgress = false;
    }
}


function renderChoices(data) {
    const choices = data.choices.map((choice) => {
        const english = choice.translations?.english?.slice(0, 2).join(", ");
        const russian = choice.translations?.russian?.slice(0, 2).join(", ");
        const translations = [
            english ? `🇬🇧 ${english}` : "",
            russian ? `🇷🇺 ${russian}` : ""
        ].filter(Boolean).join(" · ");

        return `
            <button class="choice" type="button" data-word="${escapeHtml(choice.word)}">
                <span class="choice-word">${escapeHtml(choice.word)}</span>
                ${choice.partOfSpeech ? `<span class="choice-part-of-speech">${escapeHtml(choice.partOfSpeech)}</span>` : ""}
                ${choice.definition ? `<span class="choice-definition">${escapeHtml(choice.definition)}</span>` : ""}
                ${translations ? `<span class="choice-translations">${escapeHtml(translations)}</span>` : ""}
            </button>
        `;
    }).join("");

    result.innerHTML = `
        <section class="choice-list">
            <h2>which word did you mean?</h2>
            <p>we found a few possible entries for <strong>${escapeHtml(data.query)}</strong></p>
            ${choices}
        </section>
    `;

    result.querySelectorAll(".choice").forEach((choice) => {
        choice.addEventListener("click", () => {
            searchWord(choice.dataset.word, true);
        });
    });
}


function renderWord(data) {
    let html = `
        <section class="word">

            <h2><span class="article">${escapeHtml(data.article || "")}</span>${escapeHtml(data.word)}</h2>

            <div class="word-info">
                ${
                    data.partOfSpeech
                        ? `<span>${escapeHtml(data.partOfSpeech)}</span>`
                        : ""
                }
            </div>
    `;

    if (data.pronunciation && data.pronunciation.length > 0) {
        html += `
            <div class="pronunciation">
                ${data.pronunciation
                    .map((pronunciation) => `
                        <span>${escapeHtml(pronunciation)}</span>
                    `)
                    .join(" / ")}
            </div>
        `;
    }

    const englishTranslations = data.translations?.english || [];
    const russianTranslations = data.translations?.russian || [];

    if (englishTranslations.length || russianTranslations.length) {
        html += `
            <div class="translations" aria-label="Translations">
                ${
                    englishTranslations.length
                        ? `
                            <div class="translation">
                                <span class="translation-language">🇬🇧 english</span>
                                <span class="translation-text">${escapeHtml(englishTranslations.slice(0, 3).join(", "))}</span>
                            </div>
                        `
                        : ""
                }
                ${
                    russianTranslations.length
                        ? `
                            <div class="translation">
                                <span class="translation-language">🇷🇺 russian</span>
                                <span class="translation-text">${escapeHtml(russianTranslations.slice(0, 3).join(", "))}</span>
                            </div>
                        `
                        : ""
                }
            </div>
        `;
    }

    if (data.verb) {
        const auxiliary =
            data.verb.auxiliary === "sein"
                ? "ist"
                : "hat";

        html += `
            <div class="verb-forms">

                <h3>verb forms</h3>

                <p>
                    <strong>past:</strong>
                    ${escapeHtml(data.verb.preterite)}
                </p>

                <p>
                    <strong>perfect:</strong>
                    ${escapeHtml(
                        auxiliary + " " + data.verb.perfect
                    )}
                </p>

            </div>
        `;
    }

    if (data.meanings && data.meanings.length > 0) {
        html += `
            <div class="meanings">

                <h3>meanings</h3>

                ${data.meanings.map((meaning) => `
                    <div class="meaning">

                        <p class="meaning-definition">
                            <strong>${escapeHtml(String(meaning.number))}.</strong>
                            ${escapeHtml(meaning.definition)}
                        </p>

                        ${
                            meaning.examples && meaning.examples.length > 0
                                ? `
                                    <ul class="examples">
                                        ${meaning.examples.slice(0, 3).map((example) => `
                                            <li class="example">
                                                ${escapeHtml(example)}
                                            </li>
                                        `).join("")}
                                    </ul>
                                `
                                : ""
                        }

                    </div>
                `).join("")}

            </div>
        `;
    }

    html += `
        </section>
    `;

    result.innerHTML = html;
}


result.addEventListener("dblclick", (event) => {
    const selection = window.getSelection();
    const word = selection.toString().trim();

    if (!word) {
        return;
    }

    const cleanWord = word
        .replace(/^[^\p{L}ÄÖÜäöüß]+|[^\p{L}ÄÖÜäöüß]+$/gu, "");

    if (!cleanWord) {
        return;
    }

    searchWord(cleanWord);
});


function escapeHtml(text) {
    if (!text) {
        return "";
    }

    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

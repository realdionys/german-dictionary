const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const result = document.getElementById("result");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const word = input.value.trim();

    if (!word) {
        return;
    }

    result.innerHTML = "<p>loading...</p>";

    try {
        const response = await fetch(
            `/api/word/${encodeURIComponent(word)}`
        );

        const data = await response.json();

        if (!response.ok) {
            result.innerHTML = "<p>word not found.</p>";
            return;
        }

        renderWord(data);

    } catch (error) {
        console.error(error);

        result.innerHTML = "<p>something went wrong.</p>";
    }
});

function renderWord(data) {
    let html = `
        <section class="word">

            <h2>${escapeHtml(data.word)}</h2>

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

    if (data.verb) {
    const auxiliary =
        data.verb.auxiliary === "sein"
            ? "ist"
            : "hat";

    html += `
        <div class="verb-forms">

            <h3>verb formsxx</h3>

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
    ${meaning.examples.map((example) => `
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
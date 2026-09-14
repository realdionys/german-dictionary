const express = require("express");
const { parseWord } = require("./wiktionary-parser");

const app = express();
const port = 3000;

app.use(express.static(__dirname));

app.get("/api/word/:word", async (req, res) => {
    const word = req.params.word;

    try {
        const url =
            "https://de.wiktionary.org/w/api.php?" +
            new URLSearchParams({
                action: "parse",
                page: word,
                prop: "wikitext",
                format: "json",
                formatversion: "2"
            });

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return res.status(404).json({
                error: "word not found"
            });
        }

        const parsedWord = parseWord(
            data.parse.wikitext,
            word
        );

        res.json(parsedWord);

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
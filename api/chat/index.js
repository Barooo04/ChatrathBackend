const connection = require('../../db');
const fetch = require('node-fetch');
const cors = require('../../utils/corsOptions');

module.exports = async (req, res) => {
    cors(req, res);

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Metodo non consentito' });
    }

    const { assistantToken, message, userId } = req.body;

    connection.query('SELECT * FROM assistants WHERE token = ?', [assistantToken], async (err, assistantResults) => {
        if (err) {
            console.log('Errore query DB:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }

        if (assistantResults.length === 0) {
            console.log('Assistente non trovato per il token:', assistantToken);
            return res.status(404).json({ message: 'Assistente non trovato' });
        }

        const apiUrl =
            assistantToken === 'asst_QCWfQJx5g25MNoNhHK1xN8oo'
                ? `https://fastapi-test-dxov.onrender.com/chat/asst_QCWfQJx5g25MNoNhHK1xN8oo`
                : `https://fastapi-test-dxov.onrender.com/chat/${assistantToken}`;

        try {
            const payload = {
                user_id: userId.toString(),
                prompt: message,
                assistant_id: assistantToken
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.log('Errore dalla API:', errorData);
                return res.status(response.status).json({ error: errorData.detail || 'Errore generico' });
            }

            const data = await response.json();
            return res.json({ response: data.response });
        } catch (error) {
            console.error('Errore durante la comunicazione con FastAPI:', error);
            return res.status(500).json({ error: 'Errore di connessione al server dell\'assistente' });
        }
    });
}; 
// api/chat.js
import { query } from '../../db';

export default async (req, res) => {
    if (req.method === 'POST') {
        const { assistantToken, message, userId } = req.body;

        const queryString = 'SELECT * FROM assistants WHERE token = ?';
        try {
            const assistantResults = await query(queryString, [assistantToken]);

            if (assistantResults.length === 0) {
                return res.status(404).json({ message: 'Assistente non trovato' });
            }

            const apiUrl =
                assistantToken === 'asst_QCWfQJx5g25MNoNhHK1xN8oo'
                ? `https://fastapi-test-dxov.onrender.com/chat/asst_QCWfQJx5g25MNoNhHK1xN8oo`
                : `https://fastapi-test-dxov.onrender.com/chat/${assistantToken}`;

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
                return res.status(response.status).json({ error: errorData.detail || 'Errore generico' });
            }

            const data = await response.json();
            return res.json({ response: data.response });
        } catch (error) {
            return res.status(500).json({ error: 'Errore di connessione al server dell\'assistente' });
        }
    } else {
        res.status(405).json({ message: 'Metodo non consentito' });
    }
};
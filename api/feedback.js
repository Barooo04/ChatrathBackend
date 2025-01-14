// api/feedback.js
import { query } from '../../db';

export default async (req, res) => {
    if (req.method === 'POST') {
        const { assistantId, userId, rating, comment, threadId } = req.body;

        if (!assistantId || !userId || !rating || !threadId) {
            return res.status(400).json({ success: false, message: 'Mancano dei campi obbligatori' });
        }

        const now = new Date();
        const dataChiusura = now.toISOString().slice(0, 19).replace('T', ' ');

        const queryString = `
            UPDATE metadata 
            SET data_chiusura = ?, rating = ?, comment = ?
            WHERE thread_id = ? AND user_id = ? AND assistant_id = ?
        `;
        try {
            const results = await query(queryString, [dataChiusura, rating, comment || '', threadId, userId, assistantId]);

            if (results.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Sessione di chat non trovata' });
            }

            res.status(200).json({ success: true, message: 'Feedback salvato con successo' });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Errore durante il salvataggio del feedback' });
        }
    } else {
        res.status(405).json({ message: 'Metodo non consentito' });
    }
};
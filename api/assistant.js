// api/assistants.js
import { query } from '../../db';

export default async (req, res) => {
    if (req.method === 'POST') {
        const { userId } = req.body;

        const queryString = `
            SELECT *
            FROM assistants a
            JOIN canAccess ca ON a.id = ca.assistant_id
            WHERE ca.user_id = ?
        `;
        try {
            const results = await query(queryString, [userId]);
            res.json(results);
        } catch (err) {
            res.status(500).json({ message: 'Errore interno del server' });
        }
    } else {
        res.status(405).json({ message: 'Metodo non consentito' });
    }
};
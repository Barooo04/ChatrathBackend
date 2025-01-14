// api/metadata.js
import { query } from '../../db';
import { v4 as uuidv4 } from 'uuid';

export default async (req, res) => {
    if (req.method === 'POST') {
        const { userId, assistantId, assistantName } = req.body;
        const now = new Date();
        const dataApertura = now.toISOString().slice(0, 19).replace('T', ' ');
        const threadId = uuidv4();

        const queryString = `
            INSERT INTO metadata 
            (user_id, assistant_id, data_apertura, nome_chatpage, thread_id) 
            VALUES (?, ?, ?, ?, ?)
        `;
        try {
            const results = await query(queryString, [userId, assistantId, dataApertura, assistantName, threadId]);
            res.json({ message: 'Metadata inseriti con successo', metadataId: results.insertId, threadId });
        } catch (err) {
            res.status(500).json({ message: 'Errore interno del server' });
        }
    } else {
        res.status(405).json({ message: 'Metodo non consentito' });
    }
};
import { query } from '../../db';

export default async (req, res) => {
    if (req.method === 'POST') {
        const { email, password } = req.body;

        const queryString = 'SELECT * FROM user WHERE email = ? AND password = ?';
        try {
            const results = await query(queryString, [email, password]);
            if (results.length > 0) {
                const user = results[0];
                res.json({ message: 'Login effettuato con successo!', user: { id: user.id, name: user.name } });
            } else {
                res.status(401).json({ message: 'Email o password errati' });
            }
        } catch (err) {
            res.status(500).json({ message: 'Errore interno del server' });
        }
    } else {
        res.status(405).json({ message: 'Metodo non consentito' });
    }
};
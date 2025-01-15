const connection = require('../../db');
const cors = require('../../utils/corsOptions');

module.exports = async (req, res) => {
    // Gestione CORS
    cors(req, res);

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Metodo non consentito' });
    }

    const { email, password } = req.body;

    connection.query('SELECT * FROM user WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        if (results.length > 0) {
            const user = results[0];
            res.json({ message: 'Login effettuato con successo!', user: { id: user.id, name: user.name } });
        } else {
            res.status(401).json({ message: 'Email o password errati' });
        }
    });
}; 
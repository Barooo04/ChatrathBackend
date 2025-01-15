const express = require('express');
const connection = require('./db');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.json());

// Semplifica la configurazione CORS
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://chatrathassistant.vercel.app']
        : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));

//LOGIN 
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    connection.query('SELECT * FROM user WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        if (results.length > 0) {
            const user = results[0]; // Prendi il primo risultato
            res.json({ message: 'Login effettuato con successo!', user: { id: user.id, name: user.name } }); // Includi ID e nome
        } else {
            res.status(401).json({ message: 'Email o password errati' });
        }
    });
});

//ASSISTANTS
app.post('/api/assistants', (req, res) => {
    const userId = req.body.userId; 

    const query = `
        SELECT *
        FROM assistants a
        JOIN canAccess ca ON a.id = ca.assistant_id
        WHERE ca.user_id = ?
    `;

    connection.query(query, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        res.json(results); 
    });
});

//CHAT
app.post('/api/chat', (req, res) => {
    const { assistantToken, message, userId } = req.body;

    connection.query(
        'SELECT * FROM assistants WHERE token = ?',
        [assistantToken],
        async (err, assistantResults) => {
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
        }
    );
});

//ASSISTANT TOKEN
app.get('/api/assistant/:token', (req, res) => {
    const { token } = req.params;
    
    const query = 'SELECT id, name FROM assistants WHERE token = ?';
    
    connection.query(query, [token], (err, results) => {
        if (err) {
            console.error('Errore query:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'Assistente non trovato' });
        }
        
        res.json({ 
            id: results[0].id,
            name: results[0].name
        });
    });
});

//METADATA
app.post('/api/metadata', (req, res) => {
    const { userId, assistantId, assistantName } = req.body;
    const now = new Date();
    const dataApertura = now.toISOString().slice(0, 19).replace('T', ' ');
    const threadId = uuidv4();

    const query = `
        INSERT INTO metadata 
        (user_id, assistant_id, data_apertura, nome_chatpage, thread_id) 
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(query, [userId, assistantId, dataApertura, assistantName, threadId], (err, results) => {
        if (err) {
            console.error('Errore inserimento metadata:', err);
            return res.status(500).json({ message: 'Errore interno del server' });
        }
        res.json({ 
            message: 'Metadata inseriti con successo',
            metadataId: results.insertId,
            threadId: threadId
        });
    });
});

//FEEDBACK
app.post('/api/feedback', (req, res) => {
    const { assistantId, userId, rating, comment, threadId } = req.body;

    // Validazione
    if (!assistantId || !userId || !rating || !threadId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Mancano dei campi obbligatori' 
        });
    }

    const now = new Date();
    const dataChiusura = now.toISOString().slice(0, 19).replace('T', ' ');

    const query = `
        UPDATE metadata 
        SET data_chiusura = ?,
            rating = ?,
            comment = ?
        WHERE thread_id = ? 
        AND user_id = ? 
        AND assistant_id = ?
    `;

    connection.query(
        query, 
        [dataChiusura, rating, comment || '', threadId, userId, assistantId],
        (err, results) => {
            if (err) {
                console.error('Errore durante l\'aggiornamento del feedback:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Errore durante il salvataggio del feedback'
                });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sessione di chat non trovata'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Feedback salvato con successo'
            });
        }
    );
});

// Endpoint di test
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Il server funziona correttamente!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Aggiungi gestione degli errori globale
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Si è verificato un errore interno del server' });
});

// Modifica l'export per Vercel
module.exports = app;

// Se non in produzione, avvia il server
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server in ascolto sulla porta ${PORT}`);
    });
}



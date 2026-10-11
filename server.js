const express = require('express');
const { TeamSpeak } = require('ts3-nodejs-library');

const port = Number(process.env.PORT) || 3000;
// На сервере страница слушает только localhost и отдаётся наружу через nginx
const host = process.env.HOST;

// Адрес, который видят посетители. Если не задан, страница подставит свой hostname.
const publicAddress = process.env.TS_PUBLIC_ADDRESS || null;

const query = {
    host: process.env.TS_HOST || '127.0.0.1',
    queryport: Number(process.env.TS_QUERY_PORT) || 10011,
    serverport: Number(process.env.TS_SERVER_PORT) || 9987,
    username: process.env.TS_QUERY_USER,
    password: process.env.TS_QUERY_PASSWORD,
    nickname: process.env.TS_QUERY_NICKNAME || 'status-page'
};

// Сколько живёт ответ: ServerQuery дёргается не чаще этого, сколько бы вкладок ни было открыто.
const CACHE_MS = 5000;

if (!query.username || !query.password) {
    console.error('Задайте TS_QUERY_USER и TS_QUERY_PASSWORD (см. .env.example)');
    process.exit(1);
}

let connection = null;

function getConnection() {
    if (!connection) {
        connection = TeamSpeak.connect(query)
            .then(ts => {
                ts.on('close', () => { connection = null; });
                ts.on('error', err => console.error('ServerQuery:', err.message));
                return ts;
            })
            .catch(err => {
                connection = null;
                throw err;
            });
    }
    return connection;
}

// [cspacer0]Заголовок, [*spacer1]---, [spacer2] и т.п.
const SPACER = /^\[[*clr]?spacer[^\]]*\](.*)$/i;

function toNode(channel) {
    const spacer = channel.pid === '0' && SPACER.exec(channel.name);
    if (spacer) {
        const label = spacer[1].trim();
        // Разделители из повторяющихся символов (---, ===) подписью не считаются
        return { spacer: true, name: /[\p{L}\p{N}]/u.test(label) ? label : '', users: [], children: [] };
    }
    return { name: channel.name, locked: channel.flagPassword, users: [], children: [] };
}

function toUser(client, now) {
    return {
        nickname: client.nickname,
        away: client.away,
        micMuted: client.inputMuted,
        speakerMuted: client.outputMuted,
        connectedFor: Math.max(0, now - client.lastconnected)
    };
}

async function fetchStatus() {
    const ts = await getConnection();
    const [info, channels, clients] = await Promise.all([
        ts.serverInfo(),
        ts.channelList(),
        ts.clientList({ clientType: 0 })
    ]);

    const nodes = new Map(channels.map(channel => [channel.cid, toNode(channel)]));
    const roots = [];
    channels.forEach(channel => {
        const parent = nodes.get(channel.pid);
        (parent ? parent.children : roots).push(nodes.get(channel.cid));
    });

    const now = Math.floor(Date.now() / 1000);
    clients.forEach(client => {
        const node = nodes.get(client.cid);
        if (node) node.users.push(toUser(client, now));
    });

    return {
        name: info.virtualserverName,
        address: publicAddress,
        online: clients.length,
        maxClients: info.virtualserverMaxclients,
        uptime: info.virtualserverUptime,
        // Средние по всем подключённым: пинг в мс, потери долей от 0 до 1
        ping: info.virtualserverTotalPing,
        packetLoss: info.virtualserverTotalPacketlossTotal,
        channels: roots
    };
}

let cache = { at: 0, status: null };

function getStatus() {
    if (Date.now() - cache.at > CACHE_MS) {
        const status = fetchStatus().catch(err => {
            cache.at = 0;
            throw err;
        });
        cache = { at: Date.now(), status };
    }
    return cache.status;
}

const app = express();
app.disable('x-powered-by');
app.use(express.static('public'));

app.get('/api/status', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store').json(await getStatus());
    } catch (err) {
        console.error(err.message);
        res.status(503).json({ error: 'Нет связи с сервером TeamSpeak' });
    }
});

app.listen(port, host, () => {
    console.log(`Server running at http://localhost:${port}`);
});

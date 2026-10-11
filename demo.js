// Данные для запуска без TeamSpeak: node server.js --demo

const user = (nickname, minutes, flags = {}) => ({
    nickname,
    away: false,
    micMuted: false,
    speakerMuted: false,
    connectedFor: minutes * 60,
    ...flags
});

const channel = (name, users = [], children = [], locked = false) => ({ name, locked, users, children });

module.exports = () => {
    const channels = [
        channel('Прихожая', [user('lesha', 3)]),
        channel('Альфа', [], [
            channel('Общий', [
                user('boogiedk', 134),
                user('Kira', 97, { micMuted: true }),
                user('m0rph', 41)
            ]),
            channel('Игры', [], [
                channel('Катка 1', [user('Tim', 212), user('zheka', 208, { micMuted: true, speakerMuted: true })]),
                channel('Катка 2')
            ]),
            channel('Админская', [], [], true)
        ]),
        channel('Браво', [], [
            channel('Общий'),
            channel('Кино', [user('Sanya', 18, { away: true, micMuted: true })])
        ]),
        { spacer: true, name: '', users: [], children: [] },
        channel('AFK')
    ];

    const count = nodes => nodes.reduce((sum, node) => sum + node.users.length + count(node.children), 0);

    return {
        name: 'Selfplace',
        address: 'ts.boogiedk.me',
        online: count(channels),
        maxClients: 32,
        uptime: 4871808,
        ping: 23.4,
        packetLoss: 0.0004,
        channels
    };
};

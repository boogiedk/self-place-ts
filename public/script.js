const REFRESH_MS = 10000;

const ICONS = {
    mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
    speaker: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z',
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z'
};

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(name, title, crossed) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
    const label = document.createElementNS(ns, 'title');
    label.textContent = title;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name] + (crossed ? 'M4 4l16 16' : ''));
    svg.append(label, path);
    return svg;
}

function formatDuration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days) return `${days} д ${hours} ч`;
    if (hours) return `${hours} ч ${minutes} мин`;
    return minutes ? `${minutes} мин` : 'только что';
}

function countUsers(node) {
    return node.children.reduce((sum, child) => sum + countUsers(child), node.users.length);
}

function renderUsers(users) {
    const list = el('ul', 'users');
    users.forEach(user => {
        const item = el('li', 'user');
        if (user.away) item.classList.add('user--away');
        if (user.speakerMuted) item.classList.add('user--deaf');

        item.append(el('span', 'user__dot'), el('span', 'user__name', user.nickname));

        const flags = el('span', 'user__flags');
        if (user.away) flags.append(el('span', '', 'отошёл'));
        if (user.micMuted) flags.append(icon('mic', 'Микрофон выключен', true));
        if (user.speakerMuted) flags.append(icon('speaker', 'Звук выключен', true));

        item.append(flags, el('span', 'user__time', formatDuration(user.connectedFor)));
        list.append(item);
    });
    return list;
}

function renderChannel(node) {
    const channel = el('div', 'channel');
    if (countUsers(node) === 0) channel.classList.add('channel--empty');

    const head = el('div', 'channel__head');
    head.append(el('span', '', node.name));
    if (node.locked) head.append(icon('lock', 'Вход по паролю'));
    channel.append(head);

    if (node.users.length) channel.append(renderUsers(node.users));

    if (node.children.length) {
        const children = el('div', 'channel__children');
        node.children.forEach(child => children.append(renderChannel(child)));
        channel.append(children);
    }
    return channel;
}

// Канал верхнего уровня с подканалами — отдельное сообщество со своим заголовком.
function renderGroup(node) {
    const group = el('section', 'group');
    const online = countUsers(node);

    const title = el('h3', 'group__title');
    title.append(el('span', '', node.name));
    if (online) title.append(el('span', 'group__count', String(online)));
    group.append(title);

    if (node.users.length) group.append(renderUsers(node.users));
    node.children.forEach(child => group.append(renderChannel(child)));
    return group;
}

function renderChannels(nodes) {
    const fragment = document.createDocumentFragment();

    nodes.forEach(node => {
        if (node.spacer) {
            // Пустые разделители не нужны: блоки и так отделены линиями
            if (node.name) fragment.append(el('h3', 'group__title group__title--spacer', node.name));
        } else if (node.children.length) {
            fragment.append(renderGroup(node));
        } else {
            fragment.append(renderChannel(node));
        }
    });

    document.getElementById('channels').replaceChildren(fragment);
}

function renderServer(status) {
    const address = status.address || location.hostname;

    document.title = `${status.name} — TeamSpeak`;
    document.getElementById('server-name').textContent = status.name;
    document.getElementById('address').textContent = address;
    document.getElementById('connect').href = `ts3server://${address}`;

    document.getElementById('stat-online').textContent = status.online;
    document.getElementById('stat-slots').textContent = `/${status.maxClients}`;
    document.getElementById('stat-uptime').textContent = formatDuration(status.uptime);
    // Без людей на сервере мерить нечего: TeamSpeak отдаёт нули
    document.getElementById('stat-ping').textContent = status.online ? `${Math.round(status.ping)} мс` : '—';
    document.getElementById('stat-loss').textContent = status.online ? `${(status.packetLoss * 100).toFixed(1)}%` : '—';
}

async function refresh() {
    const updated = document.getElementById('updated');
    try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error(response.status);
        const status = await response.json();

        renderServer(status);
        renderChannels(status.channels);
        updated.textContent = `обновлено в ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        updated.classList.remove('server__updated--error');
    } catch (error) {
        updated.textContent = 'нет связи с сервером';
        updated.classList.add('server__updated--error');
    }
}

document.getElementById('copy-address').addEventListener('click', async () => {
    const hint = document.getElementById('copy-hint');
    try {
        await navigator.clipboard.writeText(document.getElementById('address').textContent);
        hint.textContent = 'скопировано';
    } catch (error) {
        hint.textContent = 'не получилось';
    }
    setTimeout(() => { hint.textContent = 'скопировать'; }, 1500);
});

document.getElementById('year').textContent = new Date().getFullYear();

// Свёрнутая вкладка сервер не опрашивает
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
refresh();

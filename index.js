const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require('@discordjs/voice');
const client = new Client({ checkUpdate: false });
const config = require(`${process.cwd()}/config.json`);

let connection = null;
let lastJoinTime = 0;
const MIN_STAY_TIME = 5000;
let retryCount = 0;
const MAX_RETRY = 3;

client.on('ready', async () => {
    log(`Đăng nhập thành công: ${client.user.tag}`);
    await safeJoinVC(client, config);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.member.id !== client.user.id) return;

    const oldVoice = oldState.channelId;
    const newVoice = newState.channelId;

    // Mất kết nối
    if (!newVoice) {
        log(`Bị disconnect khỏi voice, kiểm tra quyền và channel...`);
        await handleDisconnect(client, config);
        return;
    }

    // Nếu bị move sang kênh khác
    if (newVoice !== config.Channel) {
        const timeSinceJoin = Date.now() - lastJoinTime;
        if (timeSinceJoin < MIN_STAY_TIME) {
            log(`Bị chuyển sau ${timeSinceJoin}ms, ở nguyên tại ${newState.channel?.name}`);
            return;
        }
        log(`Chuyển kênh khác, quay lại kênh mặc định.`);
        await safeJoinVC(client, config);
    }
});

async function safeJoinVC(client, config) {
    try {
        const guild = client.guilds.cache.get(config.Guild);
        const voiceChannel = guild?.channels.cache.get(config.Channel);

        if (!guild || !voiceChannel) {
            log(`CHANNEL NOT FOUND: ${config.Channel}`, "ERROR");
            process.exit(1);
        }

        const me = guild.members.me || await guild.members.fetch(client.user.id);
        const perms = voiceChannel.permissionsFor(me);

        if (!perms.has("CONNECT") || !perms.has("VIEW_CHANNEL")) {
            log(`Không có quyền vào ${voiceChannel.name}, dừng lại.`, "WARN");
            return;
        }

        if (connection && connection.joinConfig.channelId === voiceChannel.id) return;

        if (connection) {
            connection.destroy();
            connection = null;
        }

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: true,
        });

        retryCount = 0;
        lastJoinTime = Date.now();
        log(`Đã vào ${voiceChannel.name}`);
    } catch (err) {
        log(`Lỗi khi join voice: ${err.message}`, "ERROR");
        await forceJoinOrExit(client, config);
    }
}

async function handleDisconnect(client, config) {
    const guild = client.guilds.cache.get(config.Guild);
    const voiceChannel = guild?.channels.cache.get(config.Channel);

    if (!voiceChannel) {
        log(`Kênh voice đã bị xoá hoặc không tồn tại.`, "WARN");
        await forceJoinOrExit(client, config);
        return;
    }

    const me = guild.members.me || await guild.members.fetch(client.user.id);
    const perms = voiceChannel.permissionsFor(me);
    if (!perms.has("CONNECT") || !perms.has("VIEW_CHANNEL")) {
        log(`Mất quyền vào voice, thử cơ chế dự phòng...`, "WARN");
        await forceJoinOrExit(client, config);
        return;
    }

    if (retryCount >= MAX_RETRY) {
        log(`Đã thử reconnect ${MAX_RETRY} lần thất bại.`, "ERROR");
        await forceJoinOrExit(client, config);
        return;
    }

    retryCount++;
    log(`Thử reconnect lần ${retryCount}/${MAX_RETRY}...`);
    setTimeout(() => safeJoinVC(client, config), 5000);
}

async function forceJoinOrExit(client, config) {
    log(`Kích hoạt cơ chế dự phòng — cố gắng join lại channel mặc định...`, "WARN");

    try {
        const guild = client.guilds.cache.get(config.Guild);
        const voiceChannel = guild?.channels.cache.get(config.Channel);

        if (!guild || !voiceChannel) {
            log(`CHANNEL NOT FOUND: ${config.Channel}`, "ERROR");
            process.exit(1);
        }

        const me = guild.members.me || await guild.members.fetch(client.user.id);
        const perms = voiceChannel.permissionsFor(me);

        if (!perms.has("CONNECT") || !perms.has("VIEW_CHANNEL")) {
            log(`Không thể join channel mặc định do mất quyền.`, "ERROR");
            process.exit(1);
        }

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: true,
        });

        lastJoinTime = Date.now();
        log(`Đã khôi phục và join lại ${voiceChannel.name} thành công.`);
    } catch (err) {
        log(`CHANNEL NOT FOUND: ${config.Channel}`, "ERROR");
        process.exit(1);
    }
}

function log(msg, type = "INFO") {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] [${type}] ${msg}`);
}

client.login(config.Token);

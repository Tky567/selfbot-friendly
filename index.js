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
    log(`Logged in as: ${client.user.tag}`);
    await safeJoinVC(client, config);
});
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.member.id !== client.user.id) return;
    const oldVoice = oldState.channelId;
    const newVoice = newState.channelId;
    if (!newVoice) {
        log(`Disconnected from voice, checking permissions and channel...`);
        await handleDisconnect(client, config);
        return;
    }
    if (newVoice !== config.Channel) {
        const timeSinceJoin = Date.now() - lastJoinTime;
        if (timeSinceJoin < MIN_STAY_TIME) {
            log(`Moved after ${timeSinceJoin}ms, staying at ${newState.channel?.name}`);
            return;
        }
        log(`Moved to another channel, returning to default.`);
        await safeJoinVC(client, config);
    }
});
async function safeJoinVC(client, config) {
    try {
        const guild = client.guilds.cache.get(config.Guild);
        let channelId = config.Channel;
        let voiceChannel = guild?.channels.cache.get(channelId);

        // Check main channel, if unavailable try backup
        if (!voiceChannel || !canJoin(voiceChannel, client)) {
            log(`Main channel ${channelId} unavailable, trying backup channel...`, "WARN");
            channelId = config.BackupChannel;
            voiceChannel = guild?.channels.cache.get(channelId);
        }

        if (!guild || !voiceChannel) {
            log(`NO AVAILABLE CHANNELS FOUND (Main: ${config.Channel}, Backup: ${config.BackupChannel})`, "ERROR");
            process.exit(1);
        }

        if (!canJoin(voiceChannel, client)) {
            log(`Missing permissions for both main and backup channels. Stopping.`, "ERROR");
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
            selfDeaf: true,
            selfMute: true,
        });

        retryCount = 0;
        lastJoinTime = Date.now();
        log(`Joined ${voiceChannel.name} (${voiceChannel.id === config.Channel ? "Main" : "Backup"})`);
    } catch (err) {
        log(`Error joining voice: ${err.message}`, "ERROR");
        await forceJoinOrExit(client, config);
    }
}

function canJoin(channel, client) {
    if (!channel) return false;
    const me = channel.guild.members.me || channel.guild.members.cache.get(client.user.id);
    const perms = channel.permissionsFor(me);
    return perms.has("CONNECT") && perms.has("VIEW_CHANNEL");
}
async function handleDisconnect(client, config) {
    const guild = client.guilds.cache.get(config.Guild);
    const voiceChannel = guild?.channels.cache.get(config.Channel);
    if (!voiceChannel) {
        log(`Voice channel deleted or does not exist.`, "WARN");
        await forceJoinOrExit(client, config);
        return;
    }
    const me = guild.members.me || await guild.members.fetch(client.user.id);
    const perms = voiceChannel.permissionsFor(me);
    if (!perms.has("CONNECT") || !perms.has("VIEW_CHANNEL")) {
        log(`Lost voice permissions, attempting backup mechanism...`, "WARN");
        await forceJoinOrExit(client, config);
        return;
    }
    if (retryCount >= MAX_RETRY) {
        log(`Failed to reconnect after ${MAX_RETRY} attempts.`, "ERROR");
        await forceJoinOrExit(client, config);
        return;
    }
    retryCount++;
    log(`Attempting reconnect ${retryCount}/${MAX_RETRY}...`);
    setTimeout(() => safeJoinVC(client, config), 5000);
}
async function forceJoinOrExit(client, config) {
    log(`Activating backup mechanism — attempting to rejoin default channel...`, "WARN");
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
            log(`Cannot join default channel due to missing permissions.`, "ERROR");
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
        log(`Successfully restored and rejoined ${voiceChannel.name}.`);
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

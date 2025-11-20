(() => {
    const findModule = f => Object.values(webpackChunkdiscord_app.push([[Symbol()], {}, e => e]).c).find(m => m?.exports && f(m.exports))?.exports;
    webpackChunkdiscord_app.pop();

    const AppStreamStore = findModule(m => m?.Z?.__proto__?.getStreamerActiveStreamMetadata).Z;
    const GameStore = findModule(m => m?.ZP?.getRunningGames).ZP;
    const QuestStore = findModule(m => m?.Z?.__proto__?.getQuest).Z;
    const ChanStore = findModule(m => m?.Z?.__proto__?.getAllThreadsForParent).Z;
    const GuildChanStore = findModule(m => m?.ZP?.getSFWDefaultChannel).ZP;
    const Dispatcher = findModule(m => m?.Z?.__proto__?.flushWaitQueue).Z;
    const Api = findModule(m => m?.tn?.get).tn;

    const currentQuest = [...QuestStore.quests.values()].find(q => q.id !== "1248385850622869556" && q.userStatus?.enrolledAt && !q.userStatus?.completedAt && new Date(q.config.expiresAt) > Date.now());
    const isDesktop = typeof DiscordNative !== "undefined";

    if (!currentQuest) {
        console.log("No active uncompleted quest found!");
        return;
    }

    const pid = Math.floor(Math.random() * 30000) + 1000;
    const appId = currentQuest.config.application.id;
    const appName = currentQuest.config.application.name;
    const questLabel = currentQuest.config.messages.questName;
    const cfg = currentQuest.config.taskConfig ?? currentQuest.config.taskConfigV2;
    const taskType = Object.keys(cfg.tasks).find(k => cfg.tasks[k] != null);
    const targetTime = cfg.tasks[taskType].target;
    let doneTime = currentQuest.userStatus?.progress?.[taskType]?.value ?? 0;

    // WATCH_VIDEO spoof
    if (/WATCH_VIDEO/.test(taskType)) {
        console.log(`Spoofing video quest: ${questLabel}`);
        const start = new Date(currentQuest.userStatus.enrolledAt).getTime();
        const buffer = 10, step = 7;

        (async () => {
            let finished = false;
            while (doneTime < targetTime) {
                const allowed = Math.floor((Date.now() - start) / 1000) + buffer;
                if (allowed - doneTime >= step) {
                    const res = await Api.post({
                        url: `/quests/${currentQuest.id}/video-progress`,
                        body: { timestamp: Math.min(targetTime, doneTime + step + Math.random()) }
                    });
                    finished = !!res.body.completed_at;
                    doneTime = Math.min(targetTime, doneTime + step);
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!finished) {
                await Api.post({
                    url: `/quests/${currentQuest.id}/video-progress`,
                    body: { timestamp: targetTime }
                });
            }
            console.log("Quest completed!");
        })();
    }

    // PLAY_ON_DESKTOP spoof
    else if (taskType === "PLAY_ON_DESKTOP") {
        if (!isDesktop) {
            console.log("Use Discord Desktop for non-video quests:", questLabel);
            return;
        }
        Api.get({ url: `/applications/public?application_ids=${appId}` }).then(res => {
            const info = res.body[0];
            const exe = info.executables.find(e => e.os === "win32").name.replace(">", "");
            const fake = {
                cmdLine: `C:\\Program Files\\${info.name}\\${exe}`,
                exeName: exe,
                exePath: `c:/program files/${info.name.toLowerCase()}/${exe}`,
                hidden: false,
                id: appId,
                name: info.name,
                pid,
                pidPath: [pid],
                processName: info.name,
                start: Date.now()
            };
            const realList = GameStore.getRunningGames;
            const realPid = GameStore.getGameForPID;
            GameStore.getRunningGames = () => [fake];
            GameStore.getGameForPID = id => id === pid ? fake : null;
            Dispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [], added: [fake], games: [fake] });

            const handler = data => {
                const progress = currentQuest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                console.log(`Progress: ${progress}/${targetTime}`);
                if (progress >= targetTime) {
                    GameStore.getRunningGames = realList;
                    GameStore.getGameForPID = realPid;
                    Dispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fake], added: [], games: [] });
                    Dispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handler);
                    console.log("Quest completed!");
                }
            };
            Dispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", handler);
            console.log(`Spoofed game as ${appName}, wait about ${Math.ceil((targetTime - doneTime) / 60)} minutes.`);
        });
    }

    // STREAM_ON_DESKTOP spoof
    else if (taskType === "STREAM_ON_DESKTOP") {
        if (!isDesktop) {
            console.log("Use Discord Desktop for:", questLabel);
            return;
        }
        const realMeta = AppStreamStore.getStreamerActiveStreamMetadata;
        AppStreamStore.getStreamerActiveStreamMetadata = () => ({ id: appId, pid, sourceName: null });

        const listener = data => {
            const progress = currentQuest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
            console.log(`Progress: ${progress}/${targetTime}`);
            if (progress >= targetTime) {
                AppStreamStore.getStreamerActiveStreamMetadata = realMeta;
                Dispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
                console.log("Quest completed!");
            }
        };
        Dispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
        console.log(`Streaming spoof for ${appName}, need ${Math.ceil((targetTime - doneTime) / 60)} more minutes. Have at least 1 viewer in VC!`);
    }

    // PLAY_ACTIVITY spoof
    else if (taskType === "PLAY_ACTIVITY") {
        const channel = ChanStore.getSortedPrivateChannels()[0]?.id ?? Object.values(GuildChanStore.getAllGuilds()).find(g => g?.VOCAL?.length)?.VOCAL[0]?.channel.id;
        const key = `call:${channel}:1`;

        (async () => {
            while (true) {
                const res = await Api.post({ url: `/quests/${currentQuest.id}/heartbeat`, body: { stream_key: key, terminal: false } });
                const progress = res.body.progress.PLAY_ACTIVITY.value;
                console.log(`Progress: ${progress}/${targetTime}`);
                if (progress >= targetTime) {
                    await Api.post({ url: `/quests/${currentQuest.id}/heartbeat`, body: { stream_key: key, terminal: true } });
                    console.log("Quest completed!");
                    break;
                }
                await new Promise(r => setTimeout(r, 20000));
            }
        })();
    }
})();

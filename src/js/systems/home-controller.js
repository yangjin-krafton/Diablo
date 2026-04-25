import { CONFIG } from '../config.js';
import { ELEMENT_KEYS, emptyOreMap } from '../data/elements.js';

const QUEST_IDLE = 'idle';
const QUEST_ACTIVE = 'active';
const QUEST_COMPLETE = 'complete';

export class HomeController {
    constructor(home, spawner) {
        this.home = home;
        this.spawner = spawner;

        this.questState = QUEST_IDLE;
        this.questStartKills = 0;
        this.carriedFuel = 0;
        this.loadedFuel = 0;

        this.ores = emptyOreMap();

        this.departureState = 'idle';
        this.departureRemaining = CONFIG.home.departureCountdown;
        this.success = false;
        this.failureReason = '';
    }

    update(dt, player) {
        if (this.questState === QUEST_ACTIVE && this.questProgress >= CONFIG.home.questKillTarget) {
            this.questState = QUEST_COMPLETE;
        }

        if (this.departureState !== 'countdown') return;

        if (!this.home.isPlayerInRange(player)) {
            this.departureState = 'failed';
            this.failureReason = '출발 준비 중 거점 범위를 벗어났습니다.';
            this.spawner.stopBossWave();
            return;
        }

        this.departureRemaining = Math.max(0, this.departureRemaining - dt);
        if (this.departureRemaining <= 0) {
            this.departureState = 'success';
            this.success = true;
            this.spawner.stopBossWave();
        }
    }

    get questProgress() {
        if (this.questState === QUEST_IDLE) return 0;
        return Math.max(0, this.spawner.kills - this.questStartKills);
    }

    get isFuelFull() {
        return this.loadedFuel >= CONFIG.home.fuelCapacity;
    }

    get canDepart() {
        return this.isFuelFull && this.departureState !== 'countdown' && !this.success;
    }

    /** Add `amount` to the ore counter for `element`. No-op if the key is
     *  not one of the canonical ELEMENT_KEYS. */
    gainOre(element, amount = 1) {
        if (!ELEMENT_KEYS.includes(element)) return;
        this.ores[element] = (this.ores[element] ?? 0) + amount;
    }

    acceptQuest() {
        if (this.questState !== QUEST_IDLE || this.success) return false;
        this.questState = QUEST_ACTIVE;
        this.questStartKills = this.spawner.kills;
        return true;
    }

    claimReward() {
        if (this.questState !== QUEST_COMPLETE) return false;
        this.carriedFuel += CONFIG.home.questRewardFuel;
        this.questState = QUEST_IDLE;
        this.questStartKills = this.spawner.kills;
        return true;
    }

    loadFuel() {
        if (this.carriedFuel <= 0 || this.isFuelFull) return false;
        this.carriedFuel--;
        this.loadedFuel++;
        return true;
    }

    startDeparture() {
        if (!this.canDepart) return false;
        this.departureState = 'countdown';
        this.departureRemaining = CONFIG.home.departureCountdown;
        this.spawner.startBossWave(this.home);
        return true;
    }

    getPanelState() {
        return {
            questState: this.questState,
            questProgress: Math.min(this.questProgress, CONFIG.home.questKillTarget),
            questTarget: CONFIG.home.questKillTarget,
            questRewardFuel: CONFIG.home.questRewardFuel,
            carriedFuel: this.carriedFuel,
            loadedFuel: this.loadedFuel,
            fuelCapacity: CONFIG.home.fuelCapacity,
            ores: { ...this.ores },
            departureState: this.departureState,
            departureRemaining: this.departureRemaining,
            canAcceptQuest: this.questState === QUEST_IDLE && !this.isFuelFull && !this.success,
            canClaimReward: this.questState === QUEST_COMPLETE,
            canLoadFuel: this.carriedFuel > 0 && !this.isFuelFull,
            canDepart: this.canDepart,
            success: this.success,
            failureReason: this.failureReason,
        };
    }

    resetRuntime() {
        if (this.departureState === 'countdown') this.spawner.stopBossWave();
        this.departureState = 'idle';
        this.departureRemaining = CONFIG.home.departureCountdown;
        this.failureReason = '';
    }
}

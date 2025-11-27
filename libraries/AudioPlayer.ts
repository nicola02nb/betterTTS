/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { discordTTS } from "../Sources/Discord";
import { streamElementsTTS } from "../Sources/Streamelements";
import { tikTokTTS } from "../Sources/TikTok";
import { TTSSource, TTSSourceInterface, TTSVoice, TTSVoiceOption } from "../types/ttssource";

function clamp(number: number, min: number, max: number) {
    return Math.max(min, Math.min(number, max));
}

export const sourcesOptions = [
    { label: "Discord", value: "discord" },
    { label: "StreamElements", value: "streamelements" },
    { label: "TikTok", value: "tiktok" }
];

function getSource(source: TTSSource): TTSSourceInterface<any> | undefined {
    switch (source) {
        case "discord":
            return discordTTS;
        case "streamelements":
            return streamElementsTTS;
        case "tiktok":
            return tikTokTTS;
        default:
            return undefined;
    }
}

export function getVoices(source: TTSSource): TTSVoiceOption[] {
    const sourceInterface = getSource(source);
    return sourceInterface ? sourceInterface.getVoices() : [];
}

export function getDefaultVoice(source: TTSSource): string {
    const sourceInterface = getSource(source);
    return sourceInterface ? sourceInterface.getDefaultVoice() : "";
}

export default new class AudioPlayer {
    usersCache: Map<string, HTMLAudioElement> = new Map();

    sourceInterface: TTSSourceInterface<any> = discordTTS;

    previewMessages: string[] = [];
    userAnnouncements: string[] = [];
    normalMessages: string[] = [];

    isPlaying = false;
    isPriority = false;
    usingCache = false;
    playingText = "";
    media: HTMLAudioElement | SpeechSynthesisUtterance | undefined;

    rate: number = 1.0;
    delay: number = 0;
    volume: number = 1.0;

    updateConfig(source: TTSSource, voice: TTSVoice, rate: number, delay: number, volume: number) {
        this.updateTTSSourceAndVoice(source, voice);
        this.updateRate(rate);
        this.updateDelay(delay);
        this.updateVolume(volume);
    }

    updateTTSSourceAndVoice(source: TTSSource, voice: TTSVoice) {
        this.sourceInterface = getSource(source) || discordTTS;
        if (!voice) {
            voice = this.sourceInterface.getDefaultVoice();
        }
        this.sourceInterface.setVoice(voice);
        this.usersCache.clear();
    }

    updateRate(rate: number) {
        this.rate = rate;
        if (this.media instanceof Audio)
            this.media.playbackRate = rate;
        else if (this.media instanceof SpeechSynthesisUtterance)
            this.media.rate = rate;
    }

    updateDelay(delay: number) {
        this.delay = delay;
    }

    updateVolume(volume: number) {
        this.volume = volume;
        if (this.media instanceof Audio)
            this.media.volume = clamp(volume, 0, 1);
        else if (this.media instanceof SpeechSynthesisUtterance)
            this.media.volume = clamp(volume, 0, 1);
    }

    enqueueTTSMessage(text: string, type: "preview" | "user" | "message") {
        if (!text) return;
        if (type === "preview") {
            this.previewMessages.push(text);
        } else if (type === "user") {
            this.userAnnouncements.push(text);
        } else {
            this.normalMessages.push(text);
        }
        if (!this.isPlaying) {
            this.isPlaying = true;
            this.playTTS();
        }
    }

    stopCurrentTTS() {
        if (this.media instanceof Audio)
            this.media.pause();
        else if (this.media instanceof SpeechSynthesisUtterance)
            speechSynthesis.cancel();
        this.playingText = "";
        this.media = undefined;
        this.playNextTTS();
    }

    stopTTS() {
        this.isPlaying = false;
        this.previewMessages = [];
        this.userAnnouncements = [];
        this.normalMessages = [];
        this.stopCurrentTTS();
    }

    playNextTTS() {
        setTimeout(() => {
            this.playingText = "";
            this.media = undefined;
            if (this.previewMessages.length > 0 || this.userAnnouncements.length > 0 || this.normalMessages.length > 0) {
                this.playTTS();
            } else {
                this.isPlaying = false;
            }
        }, this.delay);
    }

    playAudio() {
        if (this.media instanceof HTMLAudioElement) {
            try {
                this.media.playbackRate = this.rate;
                this.media.volume = clamp(this.volume, 0, 1);
                this.media.addEventListener("ended", () => this.playNextTTS());
                this.media.play();
            } catch (error) {
                console.error("Error playing audio:", error);
                this.playNextTTS();
            }
        } else if (this.media instanceof SpeechSynthesisUtterance) {
            this.media.rate = this.rate;
            this.media.volume = clamp(this.volume, 0, 1);
            this.media.onend = () => this.playNextTTS();
            speechSynthesis.speak(this.media);
        } else {
            this.playNextTTS();
        }
    }

    playTTS() {
        this.isPriority = this.previewMessages.length > 0;
        this.usingCache = this.userAnnouncements.length > 0;
        this.playingText = this.isPriority ? this.previewMessages.shift() || "" : this.usingCache ? this.userAnnouncements.shift() || "" : this.normalMessages.shift() || "";
        if (this.playingText) {
            if (this.usingCache) {
                const cachedAudio = this.usersCache.get(this.playingText);
                if (cachedAudio) {
                    this.media = cachedAudio;
                    this.playAudio();
                    return;
                }
            }
            this.sourceInterface.getMedia(this.playingText).then(media => {
                if (this.usingCache) this.usersCache.set(this.playingText, media);
                this.media = media;
                this.playAudio();
            }).catch(error => {
                console.error("Error getting media:", error);
                this.playNextTTS();
            });
        } else {
            this.stopCurrentTTS();
        }
    }
};

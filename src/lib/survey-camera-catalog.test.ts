// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
    addRecentCamera,
    deleteCustomCamera,
    findCamera,
    getAllCameras,
    getBuiltinCameras,
    getCustomCameras,
    getRecentCameras,
    saveCustomCamera,
    searchCameras,
    type CatalogCamera,
} from "./survey-camera-catalog";

const CUSTOM_CAMERA_STORAGE_KEY = "ironwing.cameras.custom";

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index: number) => Object.keys(store)[index] ?? null,
    };
})();

Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
});

afterEach(() => {
    localStorage.clear();
});

const CUSTOM_CAMERA: CatalogCamera = {
    canonicalName: "Custom Survey Cam 24mm",
    brand: "Custom",
    model: "Survey Cam 24mm",
    sensorWidth_mm: 23.5,
    sensorHeight_mm: 15.6,
    imageWidth_px: 6000,
    imageHeight_px: 4000,
    focalLength_mm: 24,
    landscape: true,
    fixedOrientation: false,
    minTriggerInterval_s: 0.6,
};

describe("survey camera catalog", () => {
    it("loads the bundled catalog and keeps it in the expected size range", () => {
        const cameras = getBuiltinCameras();

        expect(cameras.length).toBeGreaterThanOrEqual(60);
        expect(cameras.length).toBeLessThanOrEqual(80);
    });

    it("finds known cameras by canonicalName with the expected specs", () => {
        expect(findCamera("DJI Mavic 3E")).toMatchObject({
            canonicalName: "DJI Mavic 3E",
            brand: "DJI",
            model: "Mavic 3E",
            sensorWidth_mm: 17.3,
            sensorHeight_mm: 13,
            imageWidth_px: 5280,
            imageHeight_px: 3956,
            focalLength_mm: 12.29,
            minTriggerInterval_s: 0.7,
        });

        expect(findCamera("Sony A7R IV")).toMatchObject({
            canonicalName: "Sony A7R IV",
            brand: "Sony",
            model: "A7R IV",
            sensorWidth_mm: 35.7,
            sensorHeight_mm: 23.8,
            imageWidth_px: 9504,
            imageHeight_px: 6336,
            focalLength_mm: 35,
        });
    });

    it("searches cameras case-insensitively across brand, model, and canonicalName", () => {
        const results = searchCameras("mavic");
        const canonicalNames = results.map((camera) => camera.canonicalName);

        expect(canonicalNames).toEqual(
            expect.arrayContaining([
                "DJI Mavic 2 Pro",
                "DJI Mavic 3",
                "DJI Mavic 3 Classic",
                "DJI Mavic 3E",
                "DJI Mavic 3T",
            ]),
        );
    });

    it("supports saving, loading, and deleting custom cameras", () => {
        saveCustomCamera(CUSTOM_CAMERA);

        expect(getCustomCameras()).toEqual([CUSTOM_CAMERA]);
        expect(findCamera(CUSTOM_CAMERA.canonicalName)).toEqual(CUSTOM_CAMERA);

        deleteCustomCamera(CUSTOM_CAMERA.canonicalName);

        expect(getCustomCameras()).toEqual([]);
        expect(findCamera(CUSTOM_CAMERA.canonicalName)).toBeUndefined();
    });

    it("tracks recent cameras in most-recent-first order and filters unknown entries", () => {
        addRecentCamera("DJI Mavic 3E");
        addRecentCamera("Sony A7R IV");
        addRecentCamera("DJI Mavic 3E");
        addRecentCamera("Unknown Camera");

        expect(getRecentCameras().map((camera) => camera.canonicalName)).toEqual([
            "DJI Mavic 3E",
            "Sony A7R IV",
        ]);
    });

    it("includes recent custom cameras once they are saved", () => {
        saveCustomCamera(CUSTOM_CAMERA);
        addRecentCamera(CUSTOM_CAMERA.canonicalName);

        expect(getRecentCameras()).toEqual([CUSTOM_CAMERA]);
    });

    it("lets a custom camera override a builtin entry with the same canonicalName", () => {
        const builtin = findCamera("DJI Mavic 3E");
        expect(builtin).toBeDefined();

        saveCustomCamera({
            canonicalName: "DJI Mavic 3E",
            brand: "DJI",
            model: "Mavic 3E (Custom Override)",
            sensorWidth_mm: 18,
            sensorHeight_mm: 13.5,
            imageWidth_px: 6000,
            imageHeight_px: 4000,
            focalLength_mm: 13,
            landscape: false,
            fixedOrientation: true,
            minTriggerInterval_s: 0.4,
        });

        expect(findCamera("DJI Mavic 3E")).toMatchObject({
            model: "Mavic 3E (Custom Override)",
            sensorWidth_mm: 18,
            sensorHeight_mm: 13.5,
            imageWidth_px: 6000,
            imageHeight_px: 4000,
            focalLength_mm: 13,
            landscape: false,
            fixedOrientation: true,
            minTriggerInterval_s: 0.4,
        });

        expect(getBuiltinCameras().find((camera) => camera.canonicalName === "DJI Mavic 3E")).toEqual(
            builtin,
        );
    });

    it("returns an empty custom list for empty or corrupt localStorage state", () => {
        expect(getCustomCameras()).toEqual([]);

        localStorage.setItem(CUSTOM_CAMERA_STORAGE_KEY, "{not valid json");
        expect(getCustomCameras()).toEqual([]);

        localStorage.setItem(CUSTOM_CAMERA_STORAGE_KEY, JSON.stringify({ bad: true }));
        expect(getCustomCameras()).toEqual([]);
    });

    it("keeps all catalog entries physically valid", () => {
        for (const camera of getAllCameras()) {
            expect(camera.canonicalName).not.toBe("");
            expect(camera.brand).not.toBe("");
            expect(camera.model).not.toBe("");
            expect(camera.sensorWidth_mm).toBeGreaterThan(0);
            expect(camera.sensorHeight_mm).toBeGreaterThan(0);
            expect(camera.imageWidth_px).toBeGreaterThan(0);
            expect(camera.imageHeight_px).toBeGreaterThan(0);
            expect(camera.focalLength_mm).toBeGreaterThan(0);
        }
    });
});

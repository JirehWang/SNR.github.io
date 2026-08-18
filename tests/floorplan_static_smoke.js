const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = process.env.FLOORPLAN_SMOKE_URL || "";

function createMockElement(id) {
  return {
    id,
    value: "",
    innerHTML: "",
    textContent: "",
    hidden: false,
    disabled: false,
    className: "",
    dataset: {},
    style: {},
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    scrollIntoView() {},
    focus() {},
    closest() {
      return null;
    },
    appendChild() {},
    setAttribute(name, value) {
      this[name] = value;
    },
    getBoundingClientRect() {
      return { width: 1000, height: 600, left: 0, top: 0 };
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadBundleFile(relativePath) {
  if (BASE_URL) {
    const response = await fetch(`${BASE_URL.replace(/\/$/, "")}/${relativePath.replace(/^\.\//, "")}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${relativePath}: HTTP ${response.status}`);
    }
    return response.text();
  }
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

async function main() {
  const appJs = await loadBundleFile("app.js");
  const seedRaw = await loadBundleFile("assets/floorplan/equipment-floorplan-seed.json");
  const seed = JSON.parse(seedRaw);

  const elementIds = [
    "floorplanOverlay",
    "floorplanDeviceList",
    "floorplanSelectionDetails",
    "floorplanSelectionMeta",
    "floorplanMessage",
    "floorplanLayoutBtn",
    "floorplanResetBtn",
    "floorplanSaveBtn",
    "floorplanSelectBtn",
    "floorplanCanvas",
    "disabledEquipmentSection",
    "disabledEquipmentList",
    "disabledEquipmentCount",
  ];
  const elements = new Map(elementIds.map((id) => [id, createMockElement(id)]));

  const documentStub = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createMockElement(id));
      }
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    createElement(tagName) {
      return createMockElement(tagName);
    },
  };

  const storage = new Map();
  const context = {
    console,
    fetch,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    window: {
      location: {
        href: BASE_URL || "http://127.0.0.1:8123/?view=equipment",
        search: "?view=equipment",
      },
      history: {
        replaceState() {},
      },
      localStorage: {
        getItem(key) {
          return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
          storage.set(key, value);
        },
      },
      setInterval() {
        return 1;
      },
      clearInterval() {},
      open() {},
      supabase: {
        createClient() {
          return {};
        },
      },
    },
    document: documentStub,
    globalThis: null,
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(`${appJs}\n;globalThis.__floorplanExports = { state, loadFloorplanPlacements, renderEquipmentFloorplan, renderDisabledEquipmentList, saveFloorplanLayout, applyFloorplanResize, upsertFloorplanPlacement };`, context);

  const exported = context.__floorplanExports;
  const byId = new Map(seed.map((item) => [Number(item.equipmentId), item]));
  exported.state.equipment = seed.map((item) => ({
    id: Number(item.equipmentId),
    name: item.name,
    label_name: Number(item.equipmentId) === 1 ? "Plan Label 1" : "",
    category: "TEMP",
    location: `Zone ${item.equipmentId}`,
    status: "available",
    capacity: 1,
    is_active: true,
    requires_test_condition: false,
    equipment_spec: "",
  }));
  exported.state.equipment.push({
    id: 18,
    name: "test",
    label_name: "",
    category: "TEMP",
    location: "Offline",
    status: "offline",
    capacity: 1,
    is_active: true,
    requires_test_condition: false,
    equipment_spec: "",
  });
  exported.state.selectedFloorplanEquipmentId = 1;
  exported.state.client = {
    from(tableName) {
      assert(tableName === "equipment_floorplan_placements", `Unexpected table ${tableName}`);
      return {
        select() {
          return {
            order: async () => ({
              data: null,
              error: { message: 'relation "equipment_floorplan_placements" does not exist' },
            }),
          };
        },
        upsert(rows) {
          assert(Array.isArray(rows) && (rows.length === 17 || rows.length === 18), "Expected active rows plus any preserved disabled placement");
          return {
            select() {
              return {
                order: async () => ({
                  data: null,
                  error: { message: 'relation "equipment_floorplan_placements" does not exist' },
                }),
              };
            },
          };
        },
      };
    },
  };

  await exported.loadFloorplanPlacements();
  assert(exported.state.floorplanPlacements.length === 17, "Seed fallback did not load 17 placements");
  assert(exported.state.floorplanStorageMode === "seed", "Expected seed fallback mode");

  exported.renderEquipmentFloorplan();
  exported.renderDisabledEquipmentList();
  const overlayBefore = elements.get("floorplanOverlay").innerHTML;
  assert((overlayBefore.match(/data-equipment-id="/g) || []).length === 17, "Expected 17 rendered floorplan devices");
  assert(overlayBefore.includes('data-equipment-id="1"'), "Selected equipment missing from overlay");
  assert(overlayBefore.includes("Plan Label 1"), "Expected floorplan device to use label_name");
  assert(overlayBefore.includes('data-equipment-id="17"'), "ESD live equipment ID 17 missing from overlay");
  assert(!overlayBefore.includes('data-equipment-id="18"'), "Offline equipment must not render on the floorplan");
  assert(elements.get("disabledEquipmentList").innerHTML.includes("test"), "Offline equipment missing from disabled list");
  assert(elements.get("disabledEquipmentCount").textContent === "1 台", "Disabled equipment count missing");

  const offlineEquipment = exported.state.equipment.find((item) => Number(item.id) === 18);
  offlineEquipment.status = "available";
  exported.renderEquipmentFloorplan();
  exported.renderDisabledEquipmentList();
  const restoredOverlay = elements.get("floorplanOverlay").innerHTML;
  assert(restoredOverlay.includes('data-equipment-id="18"'), "Restored equipment did not return to the floorplan");
  assert(elements.get("disabledEquipmentSection").hidden === true, "Restored equipment remained in disabled list");
  offlineEquipment.status = "offline";
  exported.renderEquipmentFloorplan();
  exported.renderDisabledEquipmentList();

  exported.state.floorplanLayoutEnabled = true;
  const original = exported.state.floorplanPlacements.find((item) => Number(item.equipment_id) === 1);
  const resized = { ...original, x_percent: original.x_percent + 1.25, y_percent: original.y_percent + 0.75 };
  exported.applyFloorplanResize(resized, "se", 1.5, 2.25);
  exported.upsertFloorplanPlacement(resized);
  exported.state.floorplanDirty = true;

  await exported.saveFloorplanLayout();

  const savedRaw = storage.get("snr.floorplan.placements.v1");
  assert(savedRaw, "Local storage fallback did not persist placements");
  const saved = JSON.parse(savedRaw);
  assert(saved.length === 17, "Saved local fallback did not keep 17 placements");
  const savedOne = saved.find((item) => Number(item.equipment_id) === 1);
  const savedTwo = saved.find((item) => Number(item.equipment_id) === 2);
  const savedSeventeen = saved.find((item) => Number(item.equipment_id) === 17);
  assert(savedOne.x_percent > original.x_percent, "Drag update was not persisted");
  assert(savedOne.width_percent > original.width_percent, "Resize update was not persisted");
  assert(savedTwo.location_state === "unplaced", "Equipment ID 2 should remain unplaced in the seed fallback");
  assert(savedSeventeen.x_percent === 78.68, "Equipment ID 17 did not receive the preserved ESD placement");
  assert(elements.get("floorplanMessage").textContent.includes("localStorage"), "Expected localStorage success message");
  assert(Number(byId.get(1).equipmentId) === 1, "Seed fixture mapping failed");

  exported.state.floorplanPlacements.push({
    equipment_id: 18,
    x_percent: 74,
    y_percent: 66,
    width_percent: 9,
    height_percent: 7,
    location_state: "placed",
  });
  exported.state.floorplanDirty = true;
  await exported.saveFloorplanLayout();
  const savedWithDisabledPlacement = JSON.parse(storage.get("snr.floorplan.placements.v1"));
  const preservedDisabled = savedWithDisabledPlacement.find((item) => Number(item.equipment_id) === 18);
  assert(preservedDisabled && preservedDisabled.x_percent === 74, "Disabled equipment placement was lost during active layout save");

  process.stdout.write("floorplan static smoke passed\n");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

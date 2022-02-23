// ============================================ //
//                Koke_Cacao                    //
// ============================================ //
/**
 * Foundries Score
 * 
 * Summary points of your unprospected foundries. Recalculates every 60 seconds by default.
 * 
 * Level 1 = Common - [100%] - [5k points]
 * Level 2 = Rare - [1/64(1.56%) for Epic] - [~ 23k points]
 * Level 3 = Rare - [1/16(6.25%) for Epic] - [~ 31k points]
 * Level 4 = Epic - [1/64(1.56%) for Legendary] - [~ 244k points]
 * Level 5 = Epic - [1/16(6.25%) for Legendary] - [~ 375k points]
 * Level 6 = Legendary - [1/64(1.56%) for Mythic] - [~ 3.3m points]
 * Level 7 = Legendary - [1/16(6.25%) for Mythic] - [~ 4.1m points]
 * Level 8+ = Mythic - [100%] - [20m points]
 * 
 * Common - 5k points -> 100k
 * Rare - 20k points -> 200k
 * Epic - 200k points -> 500k
 * Legendary - 3M points -> 20M
 * Mythic - 20M points -> 50M
 * 
 * const planetLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
 * const colors = ['#5c5c5c', '#5c5c5c', '#5c5c5c', '#a0a0a0', '#00dc80', '#6b68ff', '#c13cff', '#f8b73e', '#ff44b7'];
 * const points = [0, 5000, 23000, 31000, 244000, 375000, 3300000, 4100000, 20000000, 20000000];
*/
// TODO: send planet to root of spaning tree
import {
  EMPTY_ADDRESS,
} from '@darkforest_eth/constants';
import {
  artifactIdFromHexStr,
  isUnconfirmedProspectPlanetTx,
  isUnconfirmedFindArtifactTx,
} from "@darkforest_eth/serde";
import { ConstructorFragment } from "ethers/lib/utils";
import { ArtifactRarityNames, ArtifactRarity, PlanetLevel, PlanetLevelNames } from "@darkforest_eth/types";
import {
  isLocatable,
} from '@darkforest_eth/gamelogic';
import { Point, solve } from "./salesman";

// ============================================ //
//                Globals                       //
// ============================================ //
let viewport = ui.getViewport();
let print = console.log;

// ============================================ //
//                Settings                      //
// ============================================ //
// UI Settings
let TICKER_SPEED = 4;

// Account Settings
let GEAR = "2a85c98aa9a75c4e00f07dd1c4204b00e60af7192753dad2d1a23eadb1f5014a";
let PIRATE = "0x0000000000000000000000000000000000000000";

// Foundry Occupy
let ABANDON_USING_ENERGY_PERCENT = 0.90; // how much percent energy foundry can spend
let REFILL_ENERGY_PERCENT = 0.2; // how much energy to refill to foundry
let FOUNDRY_MIN_LEVEL = 2;
let GEAR_SPEED = 1.130; // average estimation

// ============================================ //
//                Utility                       //
// ============================================ //
function getAllPlanets() {
  return [...df.getAllPlanets()].filter((planet) => isLocatable(planet) && planet.planetLevel > 1);
}

function isPlanetProspectable(planet) {
  // either the case
  // 1. not prospected
  // 2. prospected but not found
  // 3. in the middle of transection above
  return df.isPlanetMineable(planet) &&
    !planet.hasTriedFindingArtifact;
}

function hasGear(planet) {
  let artifact = df.getArtifactWithId(artifactIdFromHexStr(GEAR));
  return artifact.onPlanetId == planet.locationId;
}

function isShipBusy(planet) {
  return isFindable(planet) || isProspectable(planet) ||
  planet.transactions?.hasTransaction(isUnconfirmedFindArtifactTx) ||
  planet.transactions?.hasTransaction(isUnconfirmedProspectPlanetTx);
}

function isFindable(planet) {
  return planet && hasGear(planet) &&
    df.isPlanetMineable(planet) &&
    planet.prospectedBlockNumber !== undefined &&
    !planet.hasTriedFindingArtifact &&
    !planet.transactions?.hasTransaction(isUnconfirmedFindArtifactTx);
}

function isProspectable(planet) {
  return planet && hasGear(planet) &&
    df.isPlanetMineable(planet) &&
    planet.prospectedBlockNumber === undefined &&
    !planet.transactions?.hasTransaction(isUnconfirmedProspectPlanetTx);
}

function getProspectablePlanet() {
  let loc = getGearLocation();
  if (loc[1] != null) return null; // gear not on planet
  let planet = loc[0];
  if (isProspectable(planet)) return planet;
}

function getFindablePlanet() {
  let loc = getGearLocation();
  if (loc[1] != null) return null; // gear not on planet
  let planet = loc[0];
  if (isFindable(planet)) return planet;
}


// get relative Gear location and arrival minutes
function getGearLocation() {
  let artifact = df.getArtifactWithId(artifactIdFromHexStr(GEAR));
  let planetId = artifact.onPlanetId;
  let arrivalWithTimer = df.getGameObjects().arrivals.get(artifact.onVoyageId);
  if (arrivalWithTimer != undefined) {
    let queuedArrival = arrivalWithTimer.arrivalData;
    let toPlanet = df.getPlanetWithId(queuedArrival.toPlanet);
    let minuteTil = (queuedArrival.arrivalTime * 1000 - Date.now()) / (1000 * 60);
    return [toPlanet, minuteTil];
  } else {
    return [df.getPlanetWithId(planetId), null];
  }
}

function isGearOnFoundry() {
  let artifact = df.getArtifactWithId(artifactIdFromHexStr(GEAR));
  let arrivalWithTimer = df.getGameObjects().arrivals.get(artifact.onVoyageId);
  if (arrivalWithTimer == undefined) {
    let planet = df.getPlanetWithId(artifact.onPlanetId);
    return isPlanetProspectable(planet);
  }
  return false; // traveling
}

function isInvadable(planet) {
  return planet &&
    isLocatable(planet) &&
    planet.capturer == EMPTY_ADDRESS &&
    planet.invader == EMPTY_ADDRESS &&
    planet.invadeStartBlock &&
    df.captureZoneGenerator.isInZone(planet.locationId) &&
    !planet.destroyed;
}

function getInvadablePlanets() {
  return df.getMyPlanets().filter((planet) => isInvadable(planet));
}

function isCaptureable(planet) {
  return planet &&
    planet.capturer == EMPTY_ADDRESS &&
    planet.energy > planet.energyCap * 0.8 &&
    planet.invadeStartBlock &&
    df.ethConnection.getCurrentBlockNumber() > planet.invadeStartBlock + df.contractConstants.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED &&
    !planet.destroyed;
}

function getCapturePlanets() {
  return df.getMyPlanets().filter((planet) => isCaptureable(planet));
}

// can abandon planet from sender to receiver
function canAbandonTo(sender, receiver, abandoning = false) {
  let energyNeeded = Math.ceil(df.getEnergyNeededForMove(sender.locationId, receiver.locationId, 1, abandoning));
  return Math.floor(sender.energyCap * ABANDON_USING_ENERGY_PERCENT) > energyNeeded;
}

function getOccupyableFoundry(levelFilter) {
  return getOccupyFoundry(levelFilter).map((l) => l[0]);
}

// return: [planetTo, planetFrom, energySpend, timeSpend]
function getOccupyFoundry(levelFilter) {
  // Basic Filter:
  // 1. minable, not mined
  // 2. not my planet
  // 3. level filter
  let planetsToCandidate = getAllPlanets().filter((planetTo) =>
    planetTo.planetLevel >= levelFilter &&
    df.isPlanetMineable(planetTo) &&
    planetTo.owner != df.getAccount() &&
    !planetTo.hasTriedFindingArtifact);
  let planetsToWithPlanetsFromWithEnergy = planetsToCandidate.map((planetTo) => {
    // planetFrom must be able to receive planetTo's energy
    let planetsFromCandidate = df.getMyPlanets().filter((planetFrom) => canAbandonTo(planetTo, planetFrom, true));
    let planetFromWithEnergyTime = minimumOccupyFrom(planetsFromCandidate, planetTo, REFILL_ENERGY_PERCENT);
    if (planetFromWithEnergyTime == null) return null;
    return [planetTo, planetFromWithEnergyTime[0], planetFromWithEnergyTime[1], planetFromWithEnergyTime[2]];
  }).filter((p) => p).sort((a, b) => a[2] - b[2]); // filter out null values
  return planetsToWithPlanetsFromWithEnergy;
}

// spaceship travel around 1.125 unit per second (assume 1.130 for simplicity)
function getOccupyFoundryCloseToGear(levelFilter) {
  return getOccupyFoundry(levelFilter).filter((data) => {
    let voyageTime = data[3];

    // get the time between gear and arriving to the foundry planet
    let gearLocation = getGearLocation();
    let gearCoord = gearLocation[0].location.coords;
    let gearAdditionalTime = gearLocation[1] == null ? 0 : gearLocation[1];
    let planetCoord = data[0].location.coords;
    let gearPlanetDistance = Math.sqrt((gearCoord.x - planetCoord.x) ** 2 + (gearCoord.y - planetCoord.y) ** 2);
    let totalGearPlanetTime = Math.floor(gearPlanetDistance * GEAR_SPEED + gearAdditionalTime);

    return voyageTime > totalGearPlanetTime;
  })
}

function nextFoundry() {
  let orderedPlanet = solveTSPGenetic(getPlanetsSalesman());
  let gearLocation = getGearLocation()[0];
  let index = orderedPlanet.indexOf(gearLocation);
  if (index == -1) print("WARNING: Gear not on path");
  // assuming increase direction
  let nextPlanet = orderedPlanet[(index + 1 == orderedPlanet.length) ? 0 : index + 1];
  let prevPlanet = orderedPlanet[(index - 1 == -1) ? orderedPlanet.length - 1 : index - 1];
  let nextDist = df.getDistCoords(gearLocation.location, nextPlanet.location);
  let prevDist = df.getDistCoords(gearLocation.location, prevPlanet.location);
  if (prevDist < nextDist) {
    return prevPlanet;
  }
  return nextPlanet;
}

// TODO: add attacking path to TSP path
function getPlanetsSalesman() {
  let planets = df.getMyPlanets().filter((planet) => df.isPlanetMineable(planet) && !planet.hasTriedFindingArtifact);
  let gearLocation = getGearLocation()[0];
  if (!planets.includes(gearLocation)) {
    print("Warning: Gear is not on path planet, adding it...");
    planets.push(gearLocation);
  }
  return planets;
}

function solveTSPGenetic(planets) {
  let points = planets.map((planet) => {
    let loc = planet.location.coords;
    return new Point(loc.x, loc.y);
  });
  return solve(points, 0.9999).map(i => planets[i]);
}

// compare
// 1. How many minutes did I spend getting energy for this foundry
// 2. How many energy can I get using the minutes if I don't send energy

// get the planet I can invade with using minimum energy
// planetsFromCandidate: list of planets to invade from
// additionalEnergyPercent: how much percent energy to refill population in the enemy planet after occupy
function minimumOccupyFrom(planetsFromCandidate, planetTo, additionalEnergyPercent) {
  let bestPlanetFrom;
  let time;
  let minEnergy = Number.MAX_SAFE_INTEGER;// TODO: not just energy, but consider regeneration cost (integral)

  planetsFromCandidate = planetsFromCandidate.filter((planet) => isLocatable(planet));
  for (let i = 0; i < planetsFromCandidate.length; i++) {
    let planetFrom = planetsFromCandidate[i];
    // TODO: assume no abandon
    let additionalEnergy = Math.ceil(planetTo.energyCap * additionalEnergyPercent);
    let energyNeeded = Math.ceil(df.getEnergyNeededForMove(planetFrom.locationId, planetTo.locationId, planetTo.energy + additionalEnergy, false));
    let timeNeeded = Math.ceil(df.getTimeForMove(planetFrom.locationId, planetTo.locationId, false));
    if (energyNeeded < minEnergy && energyNeeded < planetFrom.energy) {
      minEnergy = energyNeeded;
      time = timeNeeded;
      bestPlanetFrom = planetFrom;
    }
  }
  if (minEnergy == Number.MAX_SAFE_INTEGER) return null;
  return [bestPlanetFrom, minEnergy, time];
}
// ============================================ //
//                Command                       //
// ============================================ //
class Yukisa {
  constructor() {

  }
  refresh() {
    window.yukisa = new Yukisa();
  }

  getArtifactPoint() {
    let types = [ArtifactRarity.Unknown, ArtifactRarity.Common, ArtifactRarity.Rare, ArtifactRarity.Epic, ArtifactRarity.Legendary, ArtifactRarity.Mythic];
    types.map((type) => {
      print(`${ArtifactRarityNames[type]}: ${ui.getArtifactPointValues()[type] / 1000}k`);
    });
  }
}

function simpleUI(self, container, text) {
  let div = document.createElement('div');
  let button = document.createElement('button');
  button.style.display = 'block';
  button.style.width = '100%';
  button.innerText = text;
  button.onclick = () => {
    self.asyncUpdate().then();
  }

  let enable = document.createElement('button');
  enable.innerText = self.enable ? 'O' : 'X';
  enable.onclick = () => {
    self.enable = !self.enable;
    enable.innerText = self.enable ? 'O' : 'X';
  }

  div.style.display = "flex";
  div.style.justifyContent = "space-between";
  div.appendChild(button);
  div.appendChild(enable);

  container.appendChild(div);
}

var jsgraphs = require('js-graph-algorithms');

class FoundryMSP {
  constructor() {
    let g = null;
    let planetMST = null;
    let junkPlanets = null;
  }
  async update() {
    // make graph
    let planets = df.getMyPlanets();
    let locToIndex = {};
    this.g = new jsgraphs.WeightedGraph(planets.length);

    for (let i = 0; i < planets.length; i++) {
      let planet = planets[i];
      locToIndex[planet.locationId] = i;
      for (let j = i + 1; j < planets.length; j++) {
        let other = planets[j];
        this.g.addEdge(new jsgraphs.Edge(i, j, df.getDistCoords(planet.location.coords, other.location.coords)));
      }
    }

    // get MST
    let prim = new jsgraphs.EagerPrimMST(this.g);
    let mst = prim.mst;
    this.planetMST = mst.map((e) => {
      let v = e.either();
      let w = e.other(v);
      let planetV = planets[v];
      let planetW = planets[w];
      return [planetV, planetW, e.weight];
    });

    // find planet
    // 1. degree 1
    // 2. !isProspectable(planet) && !isFindable(planet)
    // 3. level < 4
    let degree = {}
    mst.map((e) => {
      let v = e.either();
      let w = e.other(v);
      if (degree[v] === undefined) {
        degree[v] = 1;
      } else {
        degree[v]++;
      }
      if (degree[w] === undefined) {
        degree[w] = 1;
      } else {
        degree[w]++;
      }
      return undefined;
    });

    print(degree);

    this.junkPlanets = planets.filter((planet) => {
      let i = locToIndex[planet.locationId];
      let deg = degree[i];
      return deg < 2 &&
        !(df.isPlanetMineable(planet) && !planet.hasTriedFindingArtifact) &&
        !isFindable(planet) &&
        planet.planetLevel < 4;
    });

    // abandon planet that is in range, with artifacts (if not full, else don't)

  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    if (!this.enable || this.planetMST == null || this.planetMST.length < 1) return;
    for (let i = 0; i < this.planetMST.length; i++) {
      let planetFrom = this.planetMST[i][0];
      let planetTo = this.planetMST[i][1];
      if (!planetTo.location || !planetFrom.location) continue;
      let xTo = planetTo.location.coords.x;
      let yTo = planetTo.location.coords.y;
      let xFrom = planetFrom.location.coords.x;
      let yFrom = planetFrom.location.coords.y;
      ctx.beginPath();
      ctx.moveTo(viewport.worldToCanvasX(xTo), viewport.worldToCanvasY(yTo));
      ctx.lineTo(viewport.worldToCanvasX(xFrom), viewport.worldToCanvasY(yFrom));
      ctx.stroke();
      ctx.closePath();
    }

    if (!this.enable || this.junkPlanets == null) return;
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    for (let i = 0; i < this.junkPlanets.length; i++) {
      let planet = this.junkPlanets[i];
      if (planet.location) {
        let x = planet.location.coords.x;
        let y = planet.location.coords.y;
        ctx.beginPath();
        ctx.arc(
          viewport.worldToCanvasX(x),
          viewport.worldToCanvasY(y),
          viewport.worldToCanvasDist(Math.floor(planet.range / 10)),
          0,
          2 * Math.PI,
        );
        ctx.stroke();
        ctx.closePath();
      }
    }
  }
  ui(container) {
    simpleUI(this, container, 'FoundryMSP');
  }
}

class SmallEnemy {
  constructor() {

  }
  update() {

  }
  asyncUpdate() {

  }
  draw(ctx) {

  }
  ui(container) {

  }
}

class GearTSP {
  constructor() {
    this.planetsSalesman = null;
    this.enable = false;
  }
  async update() {
    if (this.planetsSalesman == null) this.planetsSalesman = solveTSPGenetic(getPlanetsSalesman());
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    if (!this.enable || this.planetsSalesman == null || this.planetsSalesman.length < 2) return;
    for (let i = 0; i < this.planetsSalesman.length - 1; i++) {
      let planetFrom = this.planetsSalesman[i];
      let planetTo = this.planetsSalesman[i + 1];
      if (!planetTo.location || !planetFrom.location) continue;
      let xTo = planetTo.location.coords.x;
      let yTo = planetTo.location.coords.y;
      let xFrom = planetFrom.location.coords.x;
      let yFrom = planetFrom.location.coords.y;
      ctx.lineWidth = i;
      ctx.beginPath();
      ctx.moveTo(viewport.worldToCanvasX(xTo), viewport.worldToCanvasY(yTo));
      ctx.lineTo(viewport.worldToCanvasX(xFrom), viewport.worldToCanvasY(yFrom));
      ctx.stroke();
      ctx.closePath();
    }
  }
  ui(container) {
    simpleUI(this, container, 'GearTSP');
  }
}

class OccupyFoundry {
  constructor() {
    this.planetsLink = null;
    this.enable = false;
  }
  async update() {
    // TODO: don' check
    if (this.planetsLink == null) this.planetsLink = getOccupyFoundry(FOUNDRY_MIN_LEVEL);
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    if (!this.enable || this.planetsLink == null) return;
    for (let i = 0; i < this.planetsLink.length; i++) {
      let planetData = this.planetsLink[i];
      let planetTo = planetData[0];
      let planetFrom = planetData[1];
      if (!planetTo.location || !planetFrom.location) continue;
      let xTo = planetTo.location.coords.x;
      let yTo = planetTo.location.coords.y;
      let xFrom = planetFrom.location.coords.x;
      let yFrom = planetFrom.location.coords.y;
      let energySpend = planetData[2];
      ctx.lineWidth = Math.log10(energySpend);
      ctx.beginPath();
      ctx.moveTo(viewport.worldToCanvasX(xTo), viewport.worldToCanvasY(yTo));
      ctx.lineTo(viewport.worldToCanvasX(xFrom), viewport.worldToCanvasY(yFrom));
      ctx.stroke();
      ctx.closePath();
    }
  }
  ui(container) {
    simpleUI(this, container, 'OccupyFoundry');
  }
}

class InvadedPlanet {
  constructor() {
    this.planetsCircle = null;
    this.enable = false;
  }
  async update() {
    this.planetsCircle = getInvadablePlanets().concat(getCapturePlanets());
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    if (!this.enable || this.planetsCircle == null) return;
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    for (let planet of this.planetsCircle) {
      if (planet.location) {
        let x = planet.location.coords.x;
        let y = planet.location.coords.y;
        ctx.beginPath();
        ctx.arc(
          viewport.worldToCanvasX(x),
          viewport.worldToCanvasY(y),
          viewport.worldToCanvasDist(Math.floor(planet.range / 10)),
          0,
          2 * Math.PI,
        );
        // ctx.fill();
        ctx.stroke();
        ctx.closePath();
      }
    }
  }
  ui(container) {
    simpleUI(this, container, 'InvadedPlanet');
  }
}

class CleanPlanet {
  constructor() {
    this.planetsCircle = null;
    this.enable = false;
  }
  async update() {
    this.planetsCircle = getAllPlanets().filter((planet) =>
      planet.spaceJunk == 0 && planet.owner == PIRATE);
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    if (!this.enable || this.planetsCircle == null) return;
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    for (let planet of this.planetsCircle) {
      if (planet.location) {
        let x = planet.location.coords.x;
        let y = planet.location.coords.y;
        ctx.beginPath();
        ctx.arc(
          viewport.worldToCanvasX(x),
          viewport.worldToCanvasY(y),
          viewport.worldToCanvasDist(Math.floor(planet.range / 10)),
          0,
          2 * Math.PI,
        );
        // ctx.fill();
        ctx.stroke();
        ctx.closePath();
      }
    }
  }
  ui(container) {
    simpleUI(this, container, 'CleanPlanet');
  }
}

class HighlightFoundry {
  constructor() {
    this.planetsCircle = null;
    this.levelFilter = 2;
  }
  async update() {
    this.planetsCircle = getAllPlanets().filter((planet) =>
      planet.planetLevel >= this.levelFilter &&
      df.isPlanetMineable(planet) &&
      !planet.hasTriedFindingArtifact);
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    if (this.planetsCircle == null) return;
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    for (let i = 0; i < this.planetsCircle.length; i++) {
      let planet = this.planetsCircle[i];
      if (planet.location) {
        let x = planet.location.coords.x;
        let y = planet.location.coords.y;
        ctx.beginPath();
        ctx.arc(
          viewport.worldToCanvasX(x),
          viewport.worldToCanvasY(y),
          viewport.worldToCanvasDist(Math.floor(planet.range / 10)),
          0,
          2 * Math.PI,
        );
        // ctx.fill();
        ctx.stroke();
        ctx.closePath();
      }
    }
  }
  ui(container) {
    let levelSelect = document.createElement('select');
    levelSelect.style.background = 'rgb(8,8,8)';
    levelSelect.style.width = '100%';
    levelSelect.style.marginTop = '10px';
    levelSelect.style.marginBottom = '10px';
    // initialize dropdown menu to set number
    levelSelect.value = `${this.levelFilter}`;
    levelSelect.onchange = () => {
      this.levelFilter = parseInt(levelSelect.value, 10);
      this.update();
    };

    // Highlight Foundry Level
    Object.values(PlanetLevel).forEach(lvl => {
      let opt = document.createElement('option');
      opt.value = `${lvl}`;
      opt.innerText = PlanetLevelNames[lvl];
      levelSelect.appendChild(opt);
    });

    container.appendChild(levelSelect);
  }
}


// ============================================ //
//                Storage                       //
// ============================================ //
class Plugin {
  constructor() {
    window.yukisa = new Yukisa();
    // if (typeof window.yukisa === "undefined") {
    //   window.yukisa = new Yukisa();
    // }
    this.frames = 0;
    // this.enable = {
    //   JUNK_SPANNING_TREE: false,
    //   SMALL_ENEMY: false,
    //   GEAR_TSP: false,
    //   OCCUPY_FOUNDRY: false,
    //   INVADED_PLANET: false,
    //   CLEAN_PLANET: false,
    //   HIGHLIGHT_FOUNDRY: true,
    // }
    this.plugins = [
      new FoundryMSP(),
      new SmallEnemy(),
      new GearTSP(),
      new OccupyFoundry(),
      new InvadedPlanet(),
      new CleanPlanet(),
      new HighlightFoundry(),
    ]
    this.rendered = false;
    this.startLoop = false;


    if (typeof window.__YUKISA_LOOP__ == "undefined") {
      window.__YUKISA_LOOP__ = [];
    } else {
      window.__YUKISA_LOOP__.forEach((id) => clearInterval(id));
    }
    this.intervalId = setInterval(this.coreLoop.bind(this), 10000); // 10 sec
    window.__YUKISA_LOOP__.push(this.intervalId);
  }

  // ============================================ //
  //                Loop                          //
  // ============================================ //
  async coreLoop() {
    if (!this.startLoop) return;
    print("...loop...");

    // ============================================ //
    //                Prospect & Find               //
    // ============================================ //
    let prospectPlanet = getProspectablePlanet();
    if (prospectPlanet != null) df.prospectPlanet(prospectPlanet.locationId).then((fullfillValue) => {
      print("Prospectable success!");
    }, (rejectValue) => {
      print("Prospectable fail!");
    });
    let findPlanet = getFindablePlanet();
    if (findPlanet != null) df.findArtifact(findPlanet.locationId).then((fullfillValue) => {
      print("Finding success!");
    }, (rejectValue) => {
      print("Finding fail!");
    });

    let loc = getGearLocation();
    // if GEAR is not on my planet, I assume that
    // 1. there is an incoming attack to this planet
    // 2. there is a un-prospected gift
    if (loc[1] == null && loc[0].owner == df.getAccount()) {
      let thisPlanet = loc[0];
      let nextOccupyFoundry = nextFoundry();
      if (!isShipBusy(thisPlanet)) {
        ui.centerPlanet(nextOccupyFoundry);
        df.move(thisPlanet.locationId, nextOccupyFoundry.locationId, 0, 0, GEAR, false, false).then((success) => {
          print("Moving Gear Failed!");
        }, (fail) => {
          print("Moving Gear Succeed!");
        });
        print("Next:", nextOccupyFoundry.locationId);
      }
    }

    // ============================================ //
    //                Invade & Capture              //
    // ============================================ //
    let invadePlanets = getInvadablePlanets();
    for (let i = 0; i < invadePlanets.length; i++) {
      let planet = invadePlanets[i];
      df.invadePlanet(planet.locationId).then((fullfillValue) => {
        print("Invade success!");
      }, (rejectValue) => {
        print("Invade fail!");
      });
    }
    let capturePlanets = getCapturePlanets();
    for (let i = 0; i < capturePlanets.length; i++) {
      let planet = capturePlanets[i];
      df.capturePlanet(planet.locationId).then((fullfillValue) => {
        print("Capture success!");
      }, (rejectValue) => {
        print("Capture fail!");
      });
    }


  }

  // ============================================ //
  //                UI                            //
  // ============================================ //
  render(container) {
    if (this.rendered) return;
    // box UI
    container.parentElement.style.minHeight = 'unset';
    container.style.minHeight = 'unset';
    container.style.width = '200px';

    // Text on Top
    let levelLabel = document.createElement('label');
    levelLabel.innerText = 'Made by Yukisa and Koke_Cacao';
    levelLabel.style.display = 'block';

    // Find Spaceship Button
    let findMySpaceshipButton = document.createElement('button');
    findMySpaceshipButton.style.display = 'block';
    findMySpaceshipButton.style.width = '100%';
    findMySpaceshipButton.innerText = 'Locate Gear';
    findMySpaceshipButton.onclick = () => {
      let data = getGearLocation();
      let planet = data[0];
      ui.centerPlanet(planet);
      let minutes = data[1];
      if (minutes == null) {
        findMySpaceshipButton.innerText = 'Gear Found';
      } else {
        findMySpaceshipButton.innerText = `Gear Arriving in ${minutes.toFixed(2)}min`;
      }
    }

    let div = document.createElement('div');
    let loopText = document.createElement('button');
    loopText.style.display = 'block';
    loopText.style.width = '100%';
    loopText.innerText = '== Not Looping ==';
    loopText.onclick = () => {
      if (this.startLoop) loopText.innerText = `${df.ethConnection.getCurrentBlockNumber()}`;
      else loopText.innerText = '== Not Looping ==';
    }

    let loop = document.createElement('button');
    loop.innerText = this.startLoop ? 'O' : 'X';
    loop.onclick = () => {
      this.startLoop = !this.startLoop;
      loop.innerText = this.startLoop ? 'O' : 'X';
    }
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.appendChild(loopText);
    div.appendChild(loop);
    container.appendChild(div);

    container.appendChild(levelLabel);
    for (let i = 0; i < this.plugins.length; i++) {
      let p = this.plugins[i];
      p.ui(container);
    }
    container.appendChild(findMySpaceshipButton);

    this.rendered = true;
    return;
  }


  // ============================================ //
  //                Draw Map                      //
  // ============================================ //
  draw(ctx) {
    this.frames = (this.frames + 1) % (TICKER_SPEED * 2);
    if (this.frames < TICKER_SPEED) {
      return;
    }
    ctx.save();
    for (let i = 0; i < this.plugins.length; i++) {
      let p = this.plugins[i];
      ctx.save();
      p.draw(ctx);
      ctx.restore();
    }
    ctx.restore();
  }

  // ============================================ //
  //                Destroy                       //
  // ============================================ //
  destroy() {
    this.planetsCircle = [];
    this.planetsLink = null;
    this.planetsSalesman = null;
    // clearInterval(this.intervalId);
    // window.__YUKISA_LOOP__.forEach((id) => clearInterval(id));
    this.startLoop = false;
    this.rendered = false;
  }
}

export default Plugin;

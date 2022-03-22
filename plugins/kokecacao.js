// ============================================ //
//                Koke_Cacao                    //
// ============================================ //
'use strict';

// ============================================ //
//                Points Config                 //
// ============================================ //
var COMMON = 100;          // 100,000
var RARE = 200;            // 200,000
var EPIC = 500;            // 1,000,000
var LEGENDARY = 20 * 1000;
var MYTHIC = 50 * 1000;

var LV1F = COMMON; // 100k
var LV2F = 1 / 64 * EPIC + 63 / 64 * RARE; // 204k
var LV3F = 1 / 16 * EPIC + 15 / 16 * RARE; // 219k
var LV4F = 1 / 64 * LEGENDARY + 63 / 64 * EPIC; // 804k
var LV5F = 1 / 16 * LEGENDARY + 15 / 16 * EPIC; // 
var LV6F = 1 / 64 * MYTHIC + 63 / 64 * LEGENDARY;
var LV7F = 1 / 16 * MYTHIC + 15 / 16 * LEGENDARY;
var LV8F = MYTHIC;

var FOUNDRY_LV_FIND_GAIN = [0, LV1F, LV2F, LV3F, LV4F, LV5F, LV6F, LV7F, LV8F];

// ============================================ //
//                Settings                      //
// ============================================ //
// UI Settings
let TICKER_SPEED = 4;
// Account Settings
let GEAR = "2a85c98aa9a75c4e00f07dd1c4204b00e60af7192753dad2d1a23eadb1f5014a";
let PIRATE = "0x0000000000000000000000000000000000000000";


// ============================================ //
//                Auto Invade & Capture         //
// ============================================ //
var AUTO_INVADE_MAX_LEVEL = 9;

// ============================================ //
//                Foundry Occupy                //
// ============================================ //
let ABANDON_USING_ENERGY_PERCENT = 0.90; // how much percent energy foundry can spend
let REFILL_ENERGY_PERCENT = 0.2; // how much energy to refill to foundry
let FOUNDRY_MIN_LEVEL = 2;
let PLANET_MAX_LEVEL_FOR_FOUNDRY = 6;
let SENDING_FOR_FOUNDRY_MAX_PERCENT = 0.9;
let PERCENT_TO_REFILL_FOUNDRY = 0.1;
let GEAR_SPEED = 1.130; // average estimation

// ============================================ //
//                Auto Distribute Silver        //
// ============================================ //
let SENDING_MAX_PERCENT = 0.50;
let START_SENDING_AT_PERCENT_SILVER = 0.9;
let START_SENDING_AT_PERCENT_ENERGY = 0.5; // must > 0.5
let AUTO_SILVER_DISTRIBUTE_MINIMUM_LEVEL = 5;

// TODO: auto abandon: make your biggest planet of a cluster the root, and the leaf try to go up the tree as far as it can within one transaction.
// TODO: highlight and auto attack invaded planet
// TODO: auto abandon small planet to self or others (careful, you can't abandon home or attacking planet)
// TODO: auto distribute silver (both small to equal/larger planet or astroid), make sure can't exceed cap
// TODO: auto repeat attack, make sure can't exceed cap
// TODO: display attack time
// TODO: simultaneous attack
// TODO: highlight and make noise about incoming attack
// TODO: artifact back home can jump through level 1 planets
// TODO: implement draw energy from planet
import {
  EMPTY_ADDRESS,
} from '@darkforest_eth/constants';
import {
  artifactIdFromHexStr,
  isUnconfirmedProspectPlanetTx,
  isUnconfirmedFindArtifactTx,
} from "@darkforest_eth/serde";
import { isFullRank } from "../src/Backend/Utils/Utils";
import { ArtifactRarityNames, ArtifactRarity, PlanetLevel, PlanetLevelNames, PlanetType } from "@darkforest_eth/types";
import {
  isLocatable,
} from '@darkforest_eth/gamelogic';
import { Point, solve } from "./salesman";
import { getPlanetName } from '@darkforest_eth/procedural';

// ============================================ //
//                Globals                       //
// ============================================ //
let viewport = ui.getViewport();
let print = console.log;

// ============================================ //
//                Utility                       //
// ============================================ //
function unique(a) {
  var seen = {};
  var out = [];
  var len = a.length;
  var j = 0;
  for (var i = 0; i < len; i++) {
    var item = a[i];
    if (seen[item] !== 1) {
      seen[item] = 1;
      out[j++] = item;
    }
  }
  return out;
}

function getIncomingVoyages(planet) {
  return df.getAllVoyages().filter((arrival) => arrival.toPlanet == planet.locationId && df.getPlanetWithId(arrival.from).owner == df.getAccount());
}

function getSecSinceEpoch() {
  return Math.round(Date.now() / 1000);
}
function getAllPlanets() {
  return [...df.getAllPlanets()].filter((planet) => isLocatable(planet) && planet.planetLevel > 1);
}

function setCoolDown(dict, item, seconds) {
  dict[item] = seconds + getSecSinceEpoch();
}

function inCoolDown(dict, item) {
  return dict[item] != undefined && dict[item] < getSecSinceEpoch();
}

function getPlanetArrivals(locationId) {
  return df.getGameObjects().getArrivalIdsForLocation(locationId).map((arrivalId) =>
    df.getGameObjects().arrivals.get(arrivalId).arrivalData);
  ;
}

function getArrivingEnergy(planet) {
  return getPlanetArrivals(planet.locationId).reduce(
    (acc, arrival) => {
      return acc + arrival.energyArriving;
    },
    0
  );
}

function getArrivingSilver(planet) {
  return getPlanetArrivals(planet.locationId).reduce(
    (acc, arrival) => {
      return acc + arrival.silverMoved;
    },
    0
  );
}

function getUnconfirmedArrivingEnergy(planet) {
  return df.getUnconfirmedMoves().filter((m) => m.intent.to == planet.locationId).reduce(
    (acc, arrival) => {
      return acc + arrival.intent.forces;
    },
    0
  );
}

function getUnconfirmedArrivingSilver(planet) {
  return df.getUnconfirmedMoves().filter((m) => m.intent.to == planet.locationId).reduce(
    (acc, arrival) => {
      return acc + arrival.intent.silver;
    },
    0
  );
}

function getUnconfirmedDepartureEnergy(planet) {
  return df.getUnconfirmedMoves().filter((m) => m.intent.from == planet.locationId).reduce(
    (acc, arrival) => {
      return acc + arrival.intent.forces;
    },
    0
  );
}

function getUnconfirmedDepartureSilver(planet) {
  return df.getUnconfirmedMoves().filter((m) => m.intent.from == planet.locationId).reduce(
    (acc, arrival) => {
      return acc + arrival.intent.silver;
    },
    0
  );
}

function getFutureEnergy(planet) {
  let arrivingEnergy = getArrivingEnergy(planet);
  let unconfirmedArrivingEnergy = getUnconfirmedArrivingEnergy(planet);
  let unconfirmedDepartureEnergy = getUnconfirmedDepartureEnergy(planet);
  return Math.floor(planet.energy + arrivingEnergy + unconfirmedArrivingEnergy - unconfirmedDepartureEnergy);
}

function getFutureSilver(planet) {
  let arrivingSilver = getArrivingSilver(planet);
  let unconfirmedArrivingSilver = getUnconfirmedArrivingSilver(planet);
  let unconfirmedDepartureSilver = getUnconfirmedDepartureSilver(planet);
  return Math.floor(planet.silver + arrivingSilver + unconfirmedArrivingSilver - unconfirmedDepartureSilver);
}

function getFutureEnergyRate(planet) { // energy per second
  let futurePercent = getFutureEnergy(planet) / planet.energyCap;
  if (futurePercent > 0.98) return 0;
  return (0.01 * planet.energyCap) / (df.getEnergyCurveAtPercent(planet, 100 * (futurePercent + 0.01)) - planet.lastUpdated)
}

function isPlanetHasGiftIcon(planet) {
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
  return isFindableNow(planet) || isProspectableNow(planet) ||
    planet.transactions?.hasTransaction(isUnconfirmedFindArtifactTx) ||
    planet.transactions?.hasTransaction(isUnconfirmedProspectPlanetTx) ||
    (planet.owner != df.getAccount() && getIncomingVoyages(planet).length > 0); // waiting for arrival energy
}

// TODO: if you wait too long and don't find immediately, then the gift will gone. In interface it will let you prospect, but with command you will try to find and can't succeed.
// TODO: it will show you "someone has already prospected" when you try UI interface
// TODO: you should do it by checking planet.prospectedBlockNumber

// TODO: separate isFindable && hasGear

function isFindable(planet) {
  return planet &&
    isPlanetHasGiftIcon(planet) &&
    planet.prospectedBlockNumber !== undefined &&
    df.ethConnection.getCurrentBlockNumber() - planet.prospectedBlockNumber < 250;
}

function isFindableNow(planet) {
  return isFindable(planet) && hasGear(planet) &&
    planet.owner == df.getAccount() &&
    !planet.transactions?.hasTransaction(isUnconfirmedFindArtifactTx);
}

function isProspectable(planet) {
  return planet &&
    isPlanetHasGiftIcon(planet) &&
    planet.prospectedBlockNumber === undefined;
}

function isProspectableNow(planet) {
  return isProspectable(planet) && hasGear(planet) &&
    planet.owner == df.getAccount() &&
    !planet.transactions?.hasTransaction(isUnconfirmedProspectPlanetTx);
}

function getProspectableNowPlanet() {
  let loc = getGearLocation();
  if (loc[1] != null) return null; // gear not on planet
  let planet = loc[0];
  if (isProspectableNow(planet)) return planet;
}

function getFindableNowPlanet() {
  let loc = getGearLocation();
  if (loc[1] != null) return null; // gear not on planet
  let planet = loc[0];
  if (isFindableNow(planet)) return planet;
}

// get relative Gear location and arrival minutes
function getGearLocation() {
  let artifact = df.getArtifactWithId(artifactIdFromHexStr(GEAR));
  let planetId = artifact.onPlanetId;
  let arrivalWithTimer = df.getGameObjects().arrivals.get(artifact.onVoyageId);
  if (arrivalWithTimer != undefined) {
    let queuedArrival = arrivalWithTimer.arrivalData;
    let toPlanet = df.getPlanetWithId(queuedArrival.toPlanet);
    let minuteTil = (queuedArrival.arrivalTime - getSecSinceEpoch()) / 60;
    return [toPlanet, minuteTil];
  } else {
    return [df.getPlanetWithId(planetId), null];
  }
}

function isInvadable(planet) {
  return planet &&
    isLocatable(planet) &&
    planet.capturer == EMPTY_ADDRESS &&
    planet.invader == EMPTY_ADDRESS &&
    // planet.invadeStartBlock &&
    df.captureZoneGenerator.isInZone(planet.locationId) &&
    !planet.destroyed;
}

function getInvadablePlanets() {
  return getAllPlanets().filter((planet) => isInvadable(planet));
}

function getMyInvadablePlanets() {
  return df.getMyPlanets().filter((planet) => isInvadable(planet));
}

function isCaptureable(planet) {
  return planet &&
    planet.capturer == EMPTY_ADDRESS &&
    planet.energy > planet.energyCap * 0.8 &&
    // planet.invadeStartBlock &&
    df.ethConnection.getCurrentBlockNumber() > planet.invadeStartBlock + df.contractConstants.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED &&
    !planet.destroyed;
}

function getCapturePlanets() {
  return getAllPlanets().filter((planet) => isCaptureable(planet));
}


function getMyCapturePlanets() {
  return df.getMyPlanets().filter((planet) => isCaptureable(planet));
}

function isVulnerable(planet) {
  return planet &&
    planet.capturer == EMPTY_ADDRESS &&
    planet.invadeStartBlock &&
    df.ethConnection.getCurrentBlockNumber() < planet.invadeStartBlock + df.contractConstants.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED &&
    !planet.destroyed;
}

function getVulnerable(planet) {
  return df.getMyPlanets().filter((planet) => isVulnerable(planet));
}

// can abandon planet from sender to receiver
function canAbandonTo(sender, receiver, abandoning = false) {
  let energyNeeded = Math.ceil(df.getEnergyNeededForMove(sender.locationId, receiver.locationId, 1, abandoning));
  return Math.floor(sender.energyCap * ABANDON_USING_ENERGY_PERCENT) > energyNeeded;
}

// return: [planetTo, planetFrom, energySpend, timeSpend]
function getOccupyFoundry(foundryLevelMin) {
  // Basic Filter:
  // 1. minable, not mined
  // 2. not my planet
  // 3. level filter
  let planetsToWithPlanetsFromWithEnergy = getAllPlanets().filter((foundry) =>
    foundry.planetLevel >= foundryLevelMin &&
    foundry.owner == PIRATE &&
    isPlanetHasGiftIcon(foundry)).map((foundry) => {
      // TODO: or maybe the foundry can occupy a spacerip
      // planetFrom must be able to receive foundry's energy
      let planetsFromCandidate = df.getMyPlanets().filter((planetFrom) => canAbandonTo(foundry, planetFrom, true));
      let planetFromWithEnergyTime = minimumOccupyFrom(planetsFromCandidate, foundry, REFILL_ENERGY_PERCENT);
      if (planetFromWithEnergyTime == null) return null;
      return [foundry, planetFromWithEnergyTime[0], planetFromWithEnergyTime[1], planetFromWithEnergyTime[2]];
    }).filter((p) => p).sort((a, b) => a[2] - b[2]); // filter out null values
  return planetsToWithPlanetsFromWithEnergy;
}

function foundryTravelGain(fromFoundry, toFoundry) {
  return -df.getDistCoords(fromFoundry.location.coords, toFoundry.location.coords);
}

function foundryFindGain(fromFoundry, toFoundry) {
  return FOUNDRY_LV_FIND_GAIN[toFoundry.planetLevel];
}

function foundryOccupyGain(planet, foundry, additionalEnergyPercent, abandonPlanet = false) {
  let additionalEnergy = Math.ceil(foundry.energyCap * additionalEnergyPercent);
  let energyNeeded = Math.ceil(df.getEnergyNeededForMove(planet.locationId, foundry.locationId, foundry.energy + additionalEnergy, abandonPlanet));
  let timeNeeded = Math.ceil(df.getTimeForMove(planet.locationId, foundry.locationId, abandonPlanet));
  return -energyNeeded;
}

function getOccupyFoundryV2(foundryLevelMin, planetLevelMax, sendingPercentCap, additionalEnergyPercent) {
  let planetfoundryOccupyGain = [];
  let myPlanets = df.getMyPlanets().filter((planet) => planet.planetLevel <= planetLevelMax);
  print(`I have ${myPlanets.length} planets`);
  for (let i = 0; i < myPlanets.length; i++) {
    let foundryInRange = df.getPlanetsInRange(myPlanets[i].locationId, sendingPercentCap * 100).filter((planet) =>
      planet.planetLevel >= foundryLevelMin &&
      isPlanetHasGiftIcon(planet) &&
      planet.owner == PIRATE
    );
    print(`This planet has ${foundryInRange.length} foundries in range`);
    for (let j = 0; j < foundryInRange.length; j++) {
      if (canAbandonTo(foundryInRange[j], myPlanets[i])) {
        planetfoundryOccupyGain.push([foundryOccupyGain(myPlanets[i], foundryInRange[j], additionalEnergyPercent, false), myPlanets[i], foundryInRange[j]]);
      }
    }
  }
  print(`I have ${planetfoundryOccupyGain.length} paths`);

  let bestFoundryPlanetGain = {};
  planetfoundryOccupyGain.sort(function (a, b) { return a[0] - b[0]; }); // less gain first
  for (let i = 0; i < planetfoundryOccupyGain.length; i++) {
    let planet = planetfoundryOccupyGain[i][1];
    let foundry = planetfoundryOccupyGain[i][2];
    let gain = planetfoundryOccupyGain[i][0];
    bestFoundryPlanetGain[foundry.locationId] = [planet.locationId, gain];
  }
  print(`I have ${Object.keys(bestFoundryPlanetGain).length} to occupy`);
  return bestFoundryPlanetGain;
}

// spaceship travel around 1.125 unit per second (assume 1.130 for simplicity)
// function getOccupyFoundryCloseToGear(foundryLevelMin) {
//   return getOccupyFoundry(foundryLevelMin).filter((data) => {
//     let voyageTime = data[3];

//     // get the time between gear and arriving to the foundry planet
//     let gearLocation = getGearLocation();
//     let gearCoord = gearLocation[0].location.coords;
//     let gearAdditionalTime = gearLocation[1] == null ? 0 : gearLocation[1];
//     let planetCoord = data[0].location.coords;
//     let gearPlanetDistance = Math.sqrt((gearCoord.x - planetCoord.x) ** 2 + (gearCoord.y - planetCoord.y) ** 2);
//     let totalGearPlanetTime = Math.floor(gearPlanetDistance * GEAR_SPEED + gearAdditionalTime);

//     return voyageTime > totalGearPlanetTime;
//   })
// }

function nextFoundry() {
  let orderedPlanet = solveTSPGenetic(getPlanetsSalesman());
  if (orderedPlanet.length == 0) return null;
  let gearLocation = getGearLocation()[0];
  let index = orderedPlanet.indexOf(gearLocation);
  if (index == -1) print("WARNING: Gear not on path");
  // assuming increase direction
  let nextPlanet = orderedPlanet[(index + 1 == orderedPlanet.length) ? 0 : index + 1];
  let prevPlanet = orderedPlanet[(index - 1 == -1) ? orderedPlanet.length - 1 : index - 1];
  let nextDist = df.getDistCoords(gearLocation.location.coords, nextPlanet.location.coords);
  let prevDist = df.getDistCoords(gearLocation.location.coords, prevPlanet.location.coords);
  if (prevDist < nextDist) {
    return prevPlanet;
  }
  return nextPlanet;
}

// TODO: add attacking path to TSP path
function getPlanetsSalesman() {
  let planets = df.getMyPlanets().filter((planet) => isProspectable(planet));
  let gearLocation = getGearLocation()[0];
  if (planets.length == 0) return [];
  if (!planets.includes(gearLocation)) {
    print("Warning: Gear is not on path planet, adding it...");
    planets.push(gearLocation);
  }
  return planets;
}

function solveTSPGenetic(planets) {
  if (planets.length == 0) return [];
  let points = planets.map((planet) => {
    let loc = planet.location.coords;
    return new Point(loc.x, loc.y);
  });
  return solve(points, 0.999999).map(i => planets[i]);
}

function getUnconfirmedDepartures(planet) {
  return df.getUnconfirmedMoves().filter((m) => m.intent.to == planet.locationId)
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


class Test {
  constructor() {
    this.from = null;
    this.to = null;
    this.button = null;
    this.fromText = null;
    this.toText = null;
  }
  async loop(t) {
  }
  updateUI() {
    if (this.from != null && this.to != null) {
      let time = df.getTimeForMove(this.from.locationId, this.to.locationId, false).toFixed(0);;
      this.fromText.innerText = `T=${time}`;
      let velocity = (df.getDistCoords(this.from.location.coords, this.to.location.coords) / time).toFixed(4);;
      this.toText.innerText = `V=${velocity}`;

      let flyingEnergyNeeded = null;
      if (this.to.owner != df.getAccount()) {
        flyingEnergyNeeded = this.to.energy * this.to.defense / 100;
      } else {
        flyingEnergyNeeded = this.to.energy;
      }
      let energyNeededSpend = df.getEnergyNeededForMove(this.from.locationId, this.to.locationId, flyingEnergyNeeded);
      this.button.innerText = `E=${Math.round((arrivingEnergyNeeded / energyNeededSpend) * 100)}\%`;
    }
  }
  async update() {
    return;
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    return;
  }
  ui(container) {
    let div = document.createElement('div');
    this.button = document.createElement('button');
    this.button.style.display = 'block';
    this.button.style.width = '100%';
    this.button.innerText = "...";
    this.button.onclick = () => {
      this.button.innerText = `${
        ui.getSelectedPlanet().invadeStartBlock + 
        df.contractConstants.CAPTURE_ZONE_HOLD_BLOCKS_REQUIRED -
        df.ethConnection.getCurrentBlockNumber()} BT Capture`
    }

    this.fromText = document.createElement('button');
    this.fromText.innerText = "From"
    this.fromText.onclick = () => {
      this.from = ui.getSelectedPlanet();
      this.updateUI();
    }
    this.toText = document.createElement('button');
    this.toText.innerText = "To"
    this.toText.onclick = () => {
      this.to = ui.getSelectedPlanet();
      this.updateUI();
    }

    div.style.display = "flex";
    div.style.justifyContent = "Planet Info";
    div.appendChild(this.button);
    div.appendChild(this.fromText);
    div.appendChild(this.toText);

    container.appendChild(div);
  }
}
class FoundryMSP {
  constructor() {
    this.g = null;
    this.planetMST = null;
    this.junkPlanets = null;
    this.enable = false;
  }
  async loop(t) {
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
    // 2. !isProspectableNow(planet) && !isFindableNow(planet)
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

    this.junkPlanets = planets.filter((planet) => {
      let i = locToIndex[planet.locationId];
      let deg = degree[i];
      return deg < 2 &&
        !isProspectable(planet) &&
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

class GearTSP {
  // TODO: you job is go to to highest degree node in the original graph, not TSP graph
  // TODO: maybe instead of TSP, first try just go to the node with higher degree, if not found, then go with TSP (not really, it will result disconnected graph)
  // TODO: or, stay with TSP, but when there is a planet that covers all your out degrees, try go to that first (not really, you don't need "all" here)
  // TODO: in summery, the only problem it has is that it is not taking the short cut to skip over small planets to get to big planets (ie. the smaller middle planet's upward dirrection is within foundry planet's range), maybe always to go larger planet if possible if the larger planet has a path to highest degree (highest energy cap or range) planet
  // TODO: also, it does not abandon small planets such that all its neighbore is within range of larger planets
  constructor() {
    this.planetsSalesman = null;
    this.enable = false;
  }
  async loop(t) {
  }
  async update() {
    // occupied foundry
    // this.planetsSalesman = solveTSPGenetic(getPlanetsSalesman());
    // potential foundry
    let foundryDict = getOccupyFoundryV2(FOUNDRY_MIN_LEVEL, PLANET_MAX_LEVEL_FOR_FOUNDRY, SENDING_FOR_FOUNDRY_MAX_PERCENT, PERCENT_TO_REFILL_FOUNDRY);
    let planets = Object.keys(foundryDict).map((locationId) => df.getPlanetWithId(locationId)).concat(getPlanetsSalesman());
    this.planetsSalesman = solveTSPGenetic(planets);

    if (this.planetsSalesman.length > 1) {
      let totalTravelGain = 0;
      let totalFindGain = 0;
      for (let i = 0; i < this.planetsSalesman.length - 1; i++) {
        let from = this.planetsSalesman[i];
        let to = this.planetsSalesman[i + 1];
        totalTravelGain += foundryTravelGain(from, to);
        totalFindGain += foundryFindGain(from, to);
      }
      print(`The path costs ${-totalTravelGain} seconds`);
      print(`The path gains ${totalFindGain}K points`);
      print(`The path efficiency is ${-totalFindGain / totalTravelGain}K points per second`);
    } else {
      print("Empty TSP Path");
    }
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
      ctx.lineWidth = Math.log2(i);
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
  async loop(t) {
  }
  async update() {
    // this.planetsLink = getOccupyFoundry(FOUNDRY_MIN_LEVEL);
    this.planetsLink = getOccupyFoundryV2(FOUNDRY_MIN_LEVEL, PLANET_MAX_LEVEL_FOR_FOUNDRY, SENDING_FOR_FOUNDRY_MAX_PERCENT, PERCENT_TO_REFILL_FOUNDRY);
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'red';
    if (!this.enable || this.planetsLink == null) return;
    let keys = Object.keys(this.planetsLink);
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i];
      let value = this.planetsLink[key];
      let planetTo = df.getPlanetWithId(key);
      let planetFrom = df.getPlanetWithId(value[0]);
      if (!planetTo.location || !planetFrom.location) continue;
      let xTo = planetTo.location.coords.x;
      let yTo = planetTo.location.coords.y;
      let xFrom = planetFrom.location.coords.x;
      let yFrom = planetFrom.location.coords.y;
      ctx.lineWidth = 3;
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
    this.vulnerable = null;
    this.enable = false;
  }
  async loop(t) {
  }
  async update() {
    this.planetsCircle = getInvadablePlanets().concat(getCapturePlanets());
    this.vulnerable = getVulnerable();
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
    if (!this.enable) return;
    if (this.planetsCircle != null) {
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
    if (this.vulnerable != null) {
      ctx.fillStyle = 'green';
      ctx.strokeStyle = 'green';
      for (let planet of this.vulnerable) {
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
  async loop(t) {
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

class AutoProspect {
  constructor() {
    this.prospectedLocationIdCooldown = {};
    this.foundedLocationIdCooldown = {};
    this.enable = true;
  }
  async loop(t) {
    if (this.enable && t % 4 == 0) {
      // ============================================ //
      //                Prospect & Find               //
      // ============================================ //
      let prospectPlanet = getProspectableNowPlanet();
      if (prospectPlanet != null && !inCoolDown(this.prospectedLocationIdCooldown, prospectPlanet.locationId)) {
        df.prospectPlanet(prospectPlanet.locationId).then((fullfillValue) => {
          print("Prospectable success!");
        }, (rejectValue) => {
          print("Prospectable fail!");
        });
        setCoolDown(this.prospectedLocationIdCooldown, prospectPlanet.locationId, 60 * 60);
      }
      let findPlanet = getFindableNowPlanet();
      if (findPlanet != null && !inCoolDown(this.foundedLocationIdCooldown, findPlanet.locationId)) {
        df.findArtifact(findPlanet.locationId).then((fullfillValue) => {
          print("Finding success!");
        }, (rejectValue) => {
          print("Finding fail!");
        });
        setCoolDown(this.foundedLocationIdCooldown, findPlanet.locationId, 60 * 60);
      }
    }
  }
  async update() {
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
  }
  ui(container) {
    simpleUI(this, container, 'Auto Prospect');
  }
}
class AutoWithdrawSilver {
  constructor() {
    this.coolDown = {};
    this.enable = true;
  }
  async loop(t) {
    if (this.enable && t % 4 == 0) {
      let rips = df.getMyPlanets().filter((planet) => planet.planetType == PlanetType.TRADING_POST);
      for (let i = 0; i < rips.length; i++) {
        let rip = rips[i];
        let silver = rips.silver;
        if (silver > rips.silverCap * 0.9 && !inCoolDown(this.coolDown, rip.locationId) && !rip.transactions?.hasTransaction(isUnconfirmedWithdrawSilverTx)) {
          df.withdrawSilver(rip.locationId, silver);
          setCoolDown(this.coolDown, rip.locationId, 60 * 10);
        }
      }
    }
  }
  async update() {
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
  }
  ui(container) {
    simpleUI(this, container, 'Auto WithdrawSilver');
  }
}
class AutoInvadeOccupyWithdraw {
  constructor() {
    this.enable = false;
    this.id = null;
  }
  async loop(t) {
    // prevent multiple submission of occupy
    if (!this.enable || this.id == df.captureZoneGenerator.getNextChangeBlock()) return;
    this.id = df.captureZoneGenerator.getNextChangeBlock();

    print(`fire AutoInvadeOccupyWithdraw! Next Block: ${df.captureZoneGenerator.getNextChangeBlock()}`);

    // prevent time too little
    if ((df.captureZoneGenerator.getNextChangeBlock() - (df.ethConnection.getCurrentBlockNumber() || 0)) > 240) { // total of 256 block
      let sortedPirate = getInvadablePlanets().filter((planet) => planet.owner == PIRATE).sort((a, b) => b.planetLevel - a.planetLevel) // big level first
      print(`There exists ${sortedPirate.length} many pirates`);
      for (let i = 0; i < sortedPirate.length; i++) {
        let pirateEnergy = sortedPirate[i].energy;
        let myPlanets = df.getMyPlanets().filter((planet) => planet.planetLevel < 5);

        // find out minimum energy spend planet that satisfy constraints
        let minimumEnergy = Number.MAX_SAFE_INTEGER;
        let minimumMyPlanet = null;
        for (let j = 0; j < myPlanets.length; j++) {
          let energyToSend = Math.ceil(df.getEnergyNeededForMove(myPlanets[j].locationId, sortedPirate[i].locationId, pirateEnergy * sortedPirate[i].defense, false));
          let time = df.getTimeForMove(myPlanets[j].locationId, sortedPirate[i].locationId, false);
          let energyPercentLeft = (getFutureEnergy(myPlanets[j]) - energyToSend) / myPlanets[j].energyCap;
          // if (time > 30 * 60) print(`time ${time} too short`);
          // if (energyPercentLeft < 0.25) print(`energy percent left ${energyPercentLeft} < 0.25`);
          // if (minimumEnergy < energyToSend) print(`energy not optimal ${minimumEnergy} < ${energyToSend}`);
          if (time < 30 * 60 && energyPercentLeft > 0.25 && (minimumMyPlanet == null || energyToSend < minimumEnergy)) {
            // good candidate
            print(`Good Candidate Found!`);
            minimumEnergy = energyToSend;
            minimumMyPlanet = myPlanets[j];
          }
        }
        if (minimumMyPlanet != null) {
          // send energy and wait for transaction
          print(`Yukisa: waiting... df.move(${minimumMyPlanet.locationId}, ${sortedPirate[i].locationId}, ${minimumEnergy / 1000}k)`);
          await df.move(minimumMyPlanet.locationId, sortedPirate[i].locationId, minimumEnergy, 0, undefined, false, true);
          print(`Yukisa: transaction confirmed! df.move(${minimumMyPlanet.locationId}, ${sortedPirate[i].locationId}, ${minimumEnergy / 1000}k)`);
        }
      }
    }
  }
  async update() {
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
  }
  ui(container) {
    simpleUI(this, container, 'AutoInvade/Withdraw');
  }
}

class AutoInvade {
  constructor() {
    this.invadedLocationIdCooldown = {};
    this.capturedLocationIdCooldown = {};
    this.enable = true;
  }
  async loop(t) {
    if (this.enable && t % 10 == 0) {
      // ============================================ //
      //                Invade & Capture              //
      // ============================================ //
      let invadePlanets = getMyInvadablePlanets().filter((planet) => !inCoolDown(this.invadedLocationIdCooldown, planet.locationId));
      for (let i = 0; i < invadePlanets.length; i++) {
        let planet = invadePlanets[i];
        if (planet.planetLevel < 1 || planet.planetLevel > AUTO_INVADE_MAX_LEVEL) continue;
        df.invadePlanet(planet.locationId).then((fullfillValue) => {
          print("Invade success!");
        }, (rejectValue) => {
          print("Invade fail!");
        });
        setCoolDown(this.invadedLocationIdCooldown, planet.locationId, 60 * 60);
      }
      let capturePlanets = getMyCapturePlanets().filter((planet) => !inCoolDown(this.capturedLocationIdCooldown, planet.locationId));
      for (let i = 0; i < capturePlanets.length; i++) {
        let planet = capturePlanets[i];
        df.capturePlanet(planet.locationId).then((fullfillValue) => {
          print("Capture success!");
        }, (rejectValue) => {
          print("Capture fail!");
        });
        setCoolDown(this.capturedLocationIdCooldown, planet.locationId, 60 * 60);
      }
    }
  }
  async update() {
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
  }
  ui(container) {
    simpleUI(this, container, 'Auto Invade');
  }
}

class HighlightFoundry {
  constructor() {
    this.planetsCircle = null;
    this.levelFilter = 2;
  }
  async loop(t) {
  }
  async update() {
    this.planetsCircle = getAllPlanets().filter((planet) =>
      planet.owner != df.getAccount() &&
      planet.planetLevel >= this.levelFilter &&
      isProspectable(planet));
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

class AutoMoveGear {
  constructor() {
    this.coolDown = {};
    this.enable = false;
  }
  async loop(t) {
    if (t % 10 == 0 && this.enable) {
      let loc = getGearLocation();
      // if GEAR is not on my planet, I assume that
      // 1. there is an incoming attack to this planet
      // 2. there is a un-prospected gift
      if (loc[1] == null) {
        let thisPlanet = loc[0];
        if (inCoolDown(this.coolDown, thisPlanet.locationId)) {
          print("Gear in Cooldown");
          return;
        }
        let nextOccupyFoundry = nextFoundry();
        // print("trying to move gear");
        // let time = df.getTimeForMove(thisPlanet.locationId, nextOccupyFoundry.locationId, true); // less than 1 h
        if (nextOccupyFoundry != null && !isShipBusy(thisPlanet) &&
          df.getUnconfirmedMoves().filter((m) => m.intent.from == thisPlanet.locationId && m.intent.artifact == GEAR).length == 0) {
          ui.centerPlanet(nextOccupyFoundry);
          df.move(thisPlanet.locationId, nextOccupyFoundry.locationId, 0, 0, GEAR, false, false).then((success) => {
            print("Moving Gear Failed!");
          }, (fail) => {
            print("Moving Gear Succeed!");
          });
          print("Next:", nextOccupyFoundry.locationId);
          setCoolDown(this.coolDown, thisPlanet.locationId, 60 * 60);
        } else {
          if (isShipBusy(thisPlanet)) print("ship is busy");
          if (nextOccupyFoundry == null) print("ship cannot move to null foundry");
        }
      }
    }
  }
  async update() {
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
  }
  ui(container) {
    simpleUI(this, container, 'AutoMove Gear');
  }
}

class AutoDistributeSilver {
  constructor() {
    this.coolDown = {};
    this.enable = true;
  }
  async loop(t) {
    if (this.enable && t % 16 == 0) {
      let asteroids = df.getMyPlanets().filter((planet) => planet.planetType == PlanetType.SILVER_MINE &&
        planet.silver / planet.silverCap > START_SENDING_AT_PERCENT_SILVER &&
        planet.energy / planet.energyCap > START_SENDING_AT_PERCENT_ENERGY &&
        planet.planetLevel >= AUTO_SILVER_DISTRIBUTE_MINIMUM_LEVEL &&
        !inCoolDown(this.coolDown, planet.locationId)
      );

      // TODO: energy / silver amount should include incoming self-voyage
      for (let i = 0; i < asteroids.length; i++) {
        let asteroid = asteroids[i];
        let maximumPercent = Math.min(SENDING_MAX_PERCENT, ((asteroid.energy / asteroid.energyCap) - 0.5) * 2);
        let planetsSendTo = df.getPlanetsInRange(asteroid.locationId, maximumPercent * 100).filter((planet) => planet.owner == df.getAccount() &&
          planet.planetType == PlanetType.PLANET &&
          !isFullRank(planet) &&
          getFutureSilver(planet) < planet.silverCap);
        if (planetsSendTo.length == 0) {
          planetsSendTo = df.getPlanetsInRange(asteroid.locationId, maximumPercent * 100).filter((planet) => planet.owner == df.getAccount() &&
            planet.planetType == PlanetType.TRADING_POST &&
            getFutureSilver(planet) < planet.silverCap);
        }
        if (planetsSendTo.length == 0) continue;
        let planetLevels = planetsSendTo.map((planet) => planet.planetLevel);
        let receiver = planetsSendTo[planetLevels.indexOf(Math.max(...planetLevels))];
        let silver = Math.floor(Math.min(asteroid.silver, Math.ceil(receiver.silverCap - getFutureSilver(receiver))));
        // note [maximumPercent] should always greater than 0 here
        let energyToFillTheCap = df.getEnergyNeededForMove(asteroid.locationId, receiver.locationId, receiver.energyCap - receiver.energy, false);
        let clampedEnergy = Math.ceil(Math.min(energyToFillTheCap, maximumPercent * asteroid.energyCap));
        df.move(asteroid.locationId, receiver.locationId, clampedEnergy, silver);
        print(`Yukisa: transaction confirmed! df.move(${asteroid.locationId}, ${receiver.locationId}, ${clampedEnergy / 1000}k, ${silver})`);
        setCoolDown(this.coolDown, asteroid.locationId, 60 * 10);
      }

    }
  }
  async update() {
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
  }
  ui(container) {
    simpleUI(this, container, 'AutoDistribute Silver');
  }
}
class AutoDistributeEnergy {
  constructor() {
    this.coolDown = {};
    this.enable = true;
  }
  async loop(t) {
    var MAXIMUM_BATERY_LEVEL = 5;
    var MINIMUM_MOTHER_LEVEL = 5;

    if (this.enable && t % 16 == 0) {
      let myPlanets = df.getMyPlanets();
      for (let i = 0; i < myPlanets.length; i++) {
        for (let j = 0; j < myPlanets.length; j++) {
          if (i == j) continue;
          let sender = myPlanets[i];
          let receiver = myPlanets[j];
          if (sender.planetLevel > MAXIMUM_BATERY_LEVEL ||
            receiver.planetLevel < MINIMUM_MOTHER_LEVEL ||
            receiver.planetType != PlanetType.PLANET) continue;
          let senderPercent = sender.energy / sender.energyCap;
          let receiverPercent = sender.energy / sender.energyCap;
          if (senderPercent < 0.5 && receiverPercent > 0.5) continue; // by rule of thumb
          if (senderPercent > 0.5 && receiverPercent > 0.5) {
            // I will slow down, I know you are slowing down too
            // so I decide to send as much energy so that we can have about the same energy growth rate
            // our total growth rate should be bigger
          }

          let senderGrowth = getFutureEnergyRate(sender);
          let receiverGrowth = getFutureEnergyRate(receiver);
          if (senderGrowth > receiverGrowth) continue;

        }
      }


      let receiver = df.getMyPlanets().filter((planet) => planet.planetType == PlanetType.PLANET &&
        planet.planetLevel >= MINIMUM_MOTHER_LEVEL
      );

      // TODO: energy / silver amount should include incoming self-voyage
      for (let i = 0; i < asteroids.length; i++) {
        let asteroid = asteroids[i];
        let shouldSendPercent = Math.min(SENDING_MAX_PERCENT, ((asteroid.energy / asteroid.energyCap) - 0.5) * 2);
        let planetsSendTo = df.getPlanetsInRange(asteroid.locationId, shouldSendPercent * 100).filter((planet) => planet.owner == df.getAccount() &&
          planet.planetType == PlanetType.PLANET &&
          !isFullRank(planet) &&
          getFutureSilver(planet) < planet.silverCap);
        if (planetsSendTo.length == 0) {
          // let planetsSendTo = df.getPlanetsInRange(asteroid.locationId, shouldSendPercent).filter((planet) => planet.owner == df.getAccount() &&
          // planet.planetType == PlanetType.SILVER_BANK &&
          // planet.silver < planet.silverCap)
        } else {
          let planetLevels = planetsSendTo.map((planet) => planet.planetLevel);
          let receiver = planetsSendTo[planetLevels.indexOf(Math.max(...planetLevels))];
          let silver = Math.min(asteroid.silver, Math.ceil(receiver.silverCap - getFutureSilver(receiver)));
          // note [shouldSendPercent] should always greater than 0 here
          df.move(asteroid.locationId, receiver.locationId, Math.ceil(shouldSendPercent * asteroid.energyCap), silver);
          print(`Yukisa: transaction confirmed! df.move(${asteroid.locationId}, ${receiver.locationId}, ${Math.ceil(shouldSendPercent * asteroid.energyCap) / 1000}k, ${silver})`);
          setCoolDown(this.coolDown, asteroid.locationId, 60 * 5);
        }
      }

    }
  }
  async update() {
  }
  asyncUpdate() {
    return new Promise(this.update.bind(this));
  }
  draw(ctx) {
  }
  ui(container) {
    simpleUI(this, container, 'AutoDistribute Energy');
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

    this.plugins = [
      new FoundryMSP(),
      new GearTSP(),
      new OccupyFoundry(),
      new InvadedPlanet(),
      new CleanPlanet(),
      new HighlightFoundry(),
      new Test(),
      new AutoProspect(),
      new AutoWithdrawSilver(),
      new AutoInvade(),
      new AutoInvadeOccupyWithdraw(),
      new AutoMoveGear(),
      new AutoDistributeSilver(),
    ]
    this.rendered = false;
    this.startLoop = false;

    // ============================================ //
    //               UI Control                     //
    // ============================================ //
    this.mainText = null;
    this.attackedPlanetIds = [];
    this.attackedPlanetIndex = 0;
    this.findMySpaceshipButton = null;


    // ============================================ //
    //                Loop Control                  //
    // ============================================ //
    if (typeof window.__YUKISA_LOOP__ == "undefined") {
      window.__YUKISA_LOOP__ = [];
    } else {
      window.__YUKISA_LOOP__.forEach((id) => clearInterval(id));
    }
    this.intervalId = setInterval(this.coreLoop.bind(this), 1000); // 1 sec
    window.__YUKISA_LOOP__.push(this.intervalId);
  }

  // ============================================ //
  //                Loop                          //
  // ============================================ //
  async coreLoop() {
    if (!this.startLoop) return;

    let sec = getSecSinceEpoch();
    let attackingVoyages = df.getAllVoyages().filter((arrival) => {
      return df.getPlanetWithId(arrival.toPlanet).owner == df.getAccount() && (
        arrival.player != df.getAccount() && // abandon is under my account
        arrival.player != PIRATE // moving GEAR
      );
    });
    if (attackingVoyages.length == 0) {
      this.mainText.innerText = `Peaceful ${df.captureZoneGenerator.getNextChangeBlock() - (df.ethConnection.getCurrentBlockNumber() || 0)}b (${sec % 60})sec`;
    } else {
      let timeNow = getSecSinceEpoch();
      this.attackedPlanetIds = unique(attackingVoyages.map((attVoyage) => attVoyage.toPlanet));
      let inSec = Math.min(...(attackingVoyages.map((attVoyage) => attVoyage.arrivalTime - timeNow)));
      let inMin = Math.floor(inSec / 60);
      inSec = inSec % 60;
      let inHour = Math.floor(inMin / 60);
      inMin = inMin % 60;
      let attackPlanetNames = this.attackedPlanetIds.map((planetId) => getPlanetName(df.getPlanetWithId(planetId))).join('\n => ');
      this.mainText.innerText = `${attackingVoyages.length} Attack (${inHour} h ${inMin} min ${inSec}s)\n => ${attackPlanetNames}`;
    }


    // ============================================ //
    //                Plugin Loops                  //
    // ============================================ //
    for (let i = 0; i < this.plugins.length; i++) {
      await this.plugins[i].loop(sec);
    }

    // ============================================ //
    //                Update UI                     //
    // ============================================ //
    let data = getGearLocation();
    let minutes = data[1];
    if (minutes == null) {
      this.findMySpaceshipButton.innerText = 'Gear Not Moving';
    } else {
      let hours = Math.floor(minutes / 60);
      minutes = (minutes % 60).toFixed(2);
      this.findMySpaceshipButton.innerText = `Gear Arriving in ${hours}h ${minutes}min`;
    }
  }

  // ============================================ //
  //                UI                            //
  // ============================================ //
  render(container) {
    if (this.rendered) return;
    this.rendered = true;
    // box UI
    container.parentElement.style.minHeight = 'unset';
    container.style.minHeight = 'unset';
    container.style.width = '200px';

    // Text on Top
    this.mainText = document.createElement('label');
    this.mainText.style.display = 'block';
    this.mainText.innerText = 'Made by Yukisa';

    // ============================================ //
    //                Find Spaceship Button         //
    // ============================================ //
    this.findMySpaceshipButton = document.createElement('button');
    this.findMySpaceshipButton.style.display = 'block';
    this.findMySpaceshipButton.style.width = '100%';
    this.findMySpaceshipButton.innerText = 'Locate Gear';
    this.findMySpaceshipButton.onclick = () => {
      let data = getGearLocation();
      let planet = data[0];
      ui.centerPlanet(planet);
      let minutes = data[1];
      if (minutes == null) {
        this.findMySpaceshipButton.innerText = 'Gear Found';
      } else {
        this.findMySpaceshipButton.innerText = `Gear Arriving in ${minutes.toFixed(2)}min`;
      }
    }

    // ============================================ //
    //                Loop Control                  //
    // ============================================ //
    let div = document.createElement('div');
    let loopText = document.createElement('button');
    loopText.style.display = 'block';
    loopText.style.width = '100%';
    loopText.innerText = '== Not Looping ==';
    loopText.onclick = () => {
      if (this.startLoop) loopText.innerText = `${df.captureZoneGenerator.getNextChangeBlock() - (df.ethConnection.getCurrentBlockNumber() || 0)}`;
      else loopText.innerText = '== Not Looping ==';

      // auto focus attack
      if (this.attackedPlanetIndex < this.attackedPlanetIds.length) {
        ui.centerPlanet(df.getPlanetWithId(this.attackedPlanetIds[this.attackedPlanetIndex]));
        this.attackedPlanetIndex++;
      } else {
        this.attackedPlanetIndex = 0;
        ui.centerPlanet(df.getPlanetWithId(this.attackedPlanetIds[this.attackedPlanetIndex]));
      }
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

    // ============================================ //
    //                Plugin UI                     //
    // ============================================ //
    container.appendChild(this.mainText);
    for (let i = 0; i < this.plugins.length; i++) {
      let p = this.plugins[i];
      p.ui(container);
    }
    container.appendChild(this.findMySpaceshipButton);

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

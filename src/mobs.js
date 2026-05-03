import { MOB_SAFE_RADIUS, RARITIES, HORNET_PREFERRED_DIST_BASE, AGGRO_TIER_SCALE } from './constants.js';
import { spawnWebField, getWebSlowdownFactor, honeycombEntities } from './drops.js';
import { canMoveTo, findSpawnInZone, pickSpawnRarity, getZoneId, getZoneTier, getZoneBounds, ZONE_CONFIG } from './map.js';

// ── Mob type base definitions ──────────────────────────────────────────────────
const MOB_DEFS = {
  bee: {
    name:'Bee', description:'Eek! don\'t ram this guy!',
    radius:18, hitRadiusFactor:1.71, speed:3.2, alertSpeed:3.57, color:'#f5cf4b', border:'#ca9f25',
    xp:4, aggroRange:420, mass:80, dpsFactor:0.89,
  },
  ladybug: {
    name:'Ladybug', description:'Spots danger from surprisingly far away. Hits harder than it looks.',
    radius:18, hitRadiusFactor:1.123, speed:1.824, alertSpeed:3.2, color:'#e84040', border:'#991a1a',
    xp:3, aggroRange:260, mass:120, dpsFactor:0.86,
  },
  spider: {
    name:'Spider', description:'Yikes! Haci dolor! this little fella doesn\'t feel too good..',
    radius:18, hitRadiusFactor:1.06, speed:3.2, alertSpeed:3.2, color:'#5c3b1c', border:'#42280f',
    xp:5, aggroRange:320, mass:220, dpsFactor:1.00,
  },
  centipede_head: {
    name:'Centipede', description:'Sure is a an interesting specimen isn\'t it? It also kinda tickes with the touch..',
    radius:20, hitRadiusFactor:1.13, speed:2.1, alertSpeed:3.2, color:'#7ed62a', border:'#3a6b1a',
    xp:10, aggroRange:300, mass:180, dpsFactor:1.0,
  },
  centipede_body: {
    name:'Centipede', description:'',
    radius:20, hitRadiusFactor:1.13, speed:2.1, alertSpeed:3.2, color:'#7ed62a', border:'#3a6b1a',
    xp:4, aggroRange:0, mass:140, dpsFactor:1.0,
  },
  hornet: {
    name:'Hornet', description:'It shoots pokey things up the flowers stem..',
    radius:18, hitRadiusFactor:1.47, speed:5.8, alertSpeed:5.8, color:'#f5cf4b', border:'#ca9f25',
    xp:7, aggroRange:450, mass:70, dpsFactor:1.0,  // body damage enabled
  },
  soldier_ant: {
    name:'Soldier Ant', description:'Gah damn, this ants a visious little guy aint he?',
    radius:20, hitRadiusFactor:1.145, hitOffsetY:-5.5, speed:3.2, alertSpeed:3.2, color:'#3d3d3d', border:'#1a1a1a',
    xp:8, aggroRange:280, mass:100, dpsFactor:1.0,
  },
  worker_ant: {
    name:'Worker Ant', description:'seems like this guys just hanging around, peaceful untill hit..',
    radius:18, hitRadiusFactor:1.125, hitOffsetY:-8.5, speed:2.8, alertSpeed:2.8, color:'#3d3d3d', border:'#1a1a1a',
    xp:5, aggroRange:0, mass:90, dpsFactor:1.0,
  },
  baby_ant: {
    name:'Baby Ant', description:'Aww, what a cute baby! Gooh gooh gah gah..',
    radius:13, hitRadiusFactor:0.9, hitOffsetY:1, speed:1.5, alertSpeed:1.5, color:'#3d3d3d', border:'#1a1a1a',
    xp:2, aggroRange:0, mass:50, dpsFactor:0.0,
  },
  queen_ant: {
    name:'Queen Ant', description:'Such royalty that she can make slav- i mean soldiers at her own will..',
    radius:42, hitRadiusFactor:1.058, hitOffsetY:-32, speed:3.5, alertSpeed:3.5, color:'#3d3d3d', border:'#1a1a1a',
    xp:20, aggroRange:300, mass:220, dpsFactor:1.0,
  },
  digger: {
    name:'Digger', description:'Youch! Spikey! But he does make a good comrade..',
    radius:25, hitRadiusFactor:1.535, speed:3.2, alertSpeed:5, color:'#8c8c8c', border:'#1a1a1a',
    xp:12, aggroRange:350, mass:160, dpsFactor:1.0,
  },
  beekeeper: {
    name:'Beekeeper', description:'Spikey.. also a good comrade as well! but has stick honey lingering on it that spills off as honey tiles..',
    radius:25, hitRadiusFactor:1.188, speed:3.5, alertSpeed:5.5, color:'#F0A830', border:'#A86820',
    xp:12, aggroRange:350, mass:280, dpsFactor:1.0,
  },
  ant_hole: {
    name:'Ant Hole', description:'The beating heart of the colony. Spawns defenders when damaged. Erupts violently when destroyed.',
    radius:38, hitRadiusFactor:1.0, speed:0, alertSpeed:0, color:'#b8750a', border:'#7a4d08',
    xp:50, aggroRange:0, mass:6000, dpsFactor:1.0,
  },
  ant_egg: {
    name:'Ant Egg', description:'Turns into a slav- i mean Soldier ant',
    radius:14, hitRadiusFactor:1.04, speed:0, alertSpeed:0, color:'#e8e8e8', border:'#1a1a1a',
    xp:4, aggroRange:0, mass:180, dpsFactor:0.0,
  },
  beehive: {
    name:'Beehive', description:'Eww.. Why is it so oohy goohy icky and sticky?',
    radius:57, hitRadiusFactor:1.57, hitOffsetX:0.0, hitOffsetY:0.0, speed:0, alertSpeed:0, color:'#e8a820', border:'#a06010',
    xp:60, aggroRange:0, mass:4500, dpsFactor:1.0,
  },
  queen_bee: {
    name:'Queen Bee', description:'Same as queen ant.. Can also poo out slav- i mean gaurdians with her own free willl.. Don\'t forget, she also hurts!',
    radius:27, hitRadiusFactor:2.57, hitOffsetX:0.0, hitOffsetY:0.0, speed:3.2, alertSpeed:3.57, color:'#f5cf4b', border:'#ca9f25',
    xp:20, aggroRange:380, mass:120, dpsFactor:1.0,
  },
};

const MOB_TYPE_IDS = ['bee','ladybug','spider','hornet'];  // Diggers/beekeepers only spawn from special events

// Spider poison total damage per tier (total over 3s). Index = tier 0..13
const SPIDER_POISON_TOTAL = [
  10,30,90,270,810,2430,18225,136688,1025156,7688672,57665039,432487793,3243658447,24327438354
];

const MOB_STATS = {
  spider: {
    hp:    [125,468.75,1687.5,6750,50625,303750,4556250,54675000,820125000,12301875000,184528125000,2767921875000,41518828125000,622782421875000],
    dmg:   [10,30,90,270,810,2430,18225,136688,1025156,7688672,57665039,432487793,3243658447,24327438354],
    armor: [1,3,9,27,81,243,729,2187,6561,19683,59049,177147,531441,1594323],
  },
  bee: {
    hp:    [90,337.5,1215,4860,36450,218700,3280500,39366000,590490000,8857350000,132860250000,1992903750000,29893556250000,448403343750000],
    dmg:   [8,24,72,216,648,1944,14580,109350,820125,6150938,46132031,345990234,2594926758,19461950684],
    armor: [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  },
  ladybug: {
    hp:    [150,562.5,2025,8100,60750,364500,5467500,65610000,984150000,14762250000,221433750000,3321506250000,49822593750000,747338906250000],
    dmg:   [12,36,108,324,972,2916,21870,164025,1230188,9226406,69198047,518985352,3892390137,29192926025],
    armor: [1,3,9,27,81,243,729,2187,6561,19683,59049,177147,531441,1594323],
  },
  centipede_head: {
    hp:    [175,656.25,2362.5,9450,70875,425250,6378750,76545000,1148175000,17222625000,258339375000,3875090625000,58126359375000,871895390625000],
    dmg:   [9,27,81,243,729,2187,16403,123019,922641,6919805,51898535,389239014,2919292603,21894694519],
    armor: [1,3,9,27,81,243,729,2187,6561,19683,59049,177147,531441,1594323],
  },
};
MOB_STATS.centipede_body = MOB_STATS.centipede_head;

MOB_STATS.hornet = {
  hp:         [100,375,1350,5400,40500,243000,3645000,43740000,656100000,9841500000,147622500000,2214337500000,33215062500000,498225937500000],
  dmg:        [14,42,126,378,1134,3402,25515,191363,1435219,10764141,80731055,605482910,4541121826,34058413696],
  armor:      [1,3,9,27,81,243,729,2187,6561,19683,59049,177147,531441,1594323],
  missileHp:  [8,24,72,216,648,1944,5832,17496,52488,157464,472392,1417176,4251528,12754584],
  missileDmg: [7,21,63,189,567,1701,5103,15309,45927,137781,413343,1240029,3720087,11160261],
};

MOB_STATS.soldier_ant = {
  hp:    [200,750,2700,10800,81000,486000,7290000,87480000,1312200000,19683000000,295245000000,4428675000000,66430125000000,996451875000000],
  dmg:   [12,36,108,324,972,2916,21870,164025,1230188,9226406,69198047,518985352,3892390137,29192926025],
  armor: [2,6,18,54,162,486,1458,4374,13122,39366,118098,354294,1062882,3188646],
};

MOB_STATS.worker_ant = {
  hp:    [115,431.25,1552.5,6210,46575,279450,4191750,50301000,754515000,11317725000,169765875000,2546488125000,38197321875000,572959828125000],
  dmg:   [10,30,90,270,810,2430,18225,136688,1025156,7688672,57665039,432487793,3243658447,24327438354],
  armor: [1,3,9,27,81,243,729,2187,6561,19683,59049,177147,531441,1594323],
};

MOB_STATS.baby_ant = {
  hp:    [30,112.5,405,1620,12150,72900,1093500,13122000,196830000,2952450000,44286750000,664301250000,9964518750000,149467781250000],
  dmg:   [2,6,18,54,162,486,3645,27338,205031,1537734,11533008,86497559,648731689,4865487671],
  armor: [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
};

MOB_STATS.queen_ant = {
  hp:    [375,1406.25,5062.5,20250,151875,911250,13668750,164025000,2460375000,36905625000,553584375000,8303765625000,124556484375000,1868347265625000],
  dmg:   [15,45,135,405,1215,3645,27338,205031,1537734,11533008,86497559,648731689,4865487671,36491157532],
  armor: [2,6,18,54,162,486,1458,4374,13122,39366,118098,354294,1062882,3188646],
};

MOB_STATS.ant_hole = {
  hp:    [1000,3750,13500,54000,405000,2430000,36450000,437400000,6561000000,98415000000,1476225000000,22143375000000,332150625000000,4982259375000000],
  dmg:   [6,18,54,162,486,1458,10935,82013,615094,4613203,34599023,259492676,1946195068,14596463013],
  armor: [5,15,45,135,405,1215,3645,10935,32805,98415,295245,885735,2657205,7971615],
};

MOB_STATS.ant_egg = {
  hp:    [200,750,2700,10800,81000,486000,7290000,87480000,1312200000,19683000000,295245000000,4428675000000,66430125000000,996451875000000],
  dmg:   [3,9,27,81,243,729,5468,41006,307547,2306602,17299512,129746338,973097534,7298231506],
  armor: [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
};

MOB_STATS.digger = {
  hp:    [500,1875,6750,27000,202500,1215000,18225000,218700000,3280500000,49207500000,738112500000,11071687500000,166075312500000,2491129687500000],
  dmg:   [20,60,180,540,1620,4860,36450,273375,2050313,15377344,115330078,864975586,6487316895,48654876709],
  armor: [1,3,9,27,81,243,729,2187,6561,19683,59049,177147,531441,1594323],
};

MOB_STATS.beekeeper = {
  hp:    [450,1687.5,6075,24300,182250,1093500,16402500,196830000,2952450000,44286750000,664301250000,9964518750000,149467781250000,2242016718750000],
  dmg:   [22,66,198,594,1782,5346,40095,300713,2255344,16915078,126863086,951473145,7136048584,53520364380],
  armor: [1,3,9,27,81,243,729,2187,6561,19683,59049,177147,531441,1594323],
};

MOB_STATS.beehive = {
  hp:    [700,2625,9450,37800,283500,1701000,25515000,306180000,4592700000,68890500000,1033357500000,15500362500000,232505437500000,3487581562500000],
  dmg:   [65,195,585,1755,5265,15795,118463,888469,6663516,49976367,374822754,2811170654,21083779907,158128349304],
  armor: [5,15,45,135,405,1215,3645,10935,32805,98415,295245,885735,2657205,7971615],
};

MOB_STATS.queen_bee = {
  hp:    [450,1687.5,6075,24300,182250,1093500,16402500,196830000,2952450000,44286750000,664301250000,9964518750000,149467781250000,2242016718750000],
  dmg:   [80,240,720,2160,6480,19440,145800,1093500,8201250,61509375,461320313,3459902344,25949267578,194619506836],
  armor: [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
};

// Radius is capped at Runic (tier 10 = 55.0) — tiers 11-13 keep the same visual size.
// Mass still scales freely above Runic (see MASS_SCALE).
const RADIUS_SCALE = [1.2, 1.0, 1.2, 1.83, 3.0, 5.96, 14.55, 22.73, 30.0, 40.0, 55.0, 55.0, 55.0, 55.0];
// Mass scale per tier — derived from the intended growth examples.
// Tiers 0–8 match the provided series exactly; tiers 9–13 continue at ×2.25 per tier.
const MASS_SCALE = [1, 1.3222, 1.7556, 2.5556, 4.4, 10.2333, 49.0, 100.0, 225.0, 506.25, 1139.06, 2562.89, 5766.5, 12974.6];

function getRandomMobType() { return MOB_TYPE_IDS[Math.floor(Math.random()*MOB_TYPE_IDS.length)]; }

export function getMobStats(typeId, tier) {
  const lookupId = typeId === 'centipede_body' ? 'centipede_head' : typeId;
  const d = MOB_DEFS[lookupId];
  const s = MOB_STATS[lookupId];
  if (!d) return null;
  const t = Math.max(0,Math.min(13,tier));
  const scale = RADIUS_SCALE[t] ?? 1;
  const aggroRange = d.aggroRange>0 ? Math.round(d.aggroRange * (1 + t * AGGRO_TIER_SCALE)) : 0;
  const out = {
    name:d.name, description:d.description||'',
    hp:s?s.hp[t]:50, damage:s?s.dmg[t]:10, armor:s?s.armor[t]:0,
    speed:d.speed*Math.sqrt(scale), alertSpeed:(d.alertSpeed||d.speed)*Math.sqrt(scale),
    mass:Math.round(d.mass*(MASS_SCALE[t]??1)), aggroRange,
  };
  // Spider poison info (total over 3s and per-second)
  if (lookupId === 'spider'){
    const total = SPIDER_POISON_TOTAL[t] ?? 0;
    out.poisonTotal = total;
    out.poisonDps = Math.round(total / 3);
  }
  return out;
}

const ZONE_CHECK_INTERVAL=5*60*1000, SPAWN_DRIP_INTERVAL=1000/3;

// Mob cap per zone — high-tier zones spawn fewer but tougher mobs
function getZoneMobMax(zoneId) {
  const cfg = ZONE_CONFIG[zoneId];
  if (!cfg) return 25;
  if (cfg.tier >= 13) return 8;   // Impracticality
  if (cfg.tier >= 12) return 12;  // Umbral
  if (cfg.tier >= 10) return 18;  // Runic / Seraphic
  return 25;
}

// Death trigger = half the zone cap (so zones always can refill naturally)
function getDeathTrigger(zoneId) {
  return Math.max(3, Math.floor(getZoneMobMax(zoneId) / 2));
}

export const zoneStates = Array.from({length:15},(_,zoneId)=>({
  zoneId, mobIds:new Set(), deaths:0, spawning:false, spawnAccum:0, checkTimer:ZONE_CHECK_INTERVAL, activated:false,
  centipedeCount:0, antHoleCount:0, beehiveCount:0,
}));

let nextMobId=0, nextChainId=0;
export const mobs=[];
export const missiles=[];  // active hornet missiles
const centipedeChains=new Map();

function generateSpots(radius) {
  const spots=[], count=3+Math.floor(Math.random()*4);
  for(let i=0;i<count;i++){
    const angle=(Math.PI*0.3)+Math.random()*(Math.PI*1.4);
    const dist=Math.random()*radius*0.58, r=radius*(0.1+Math.random()*0.16);
    spots.push({ox:Math.cos(angle)*dist,oy:Math.sin(angle)*dist,r});
  }
  return spots;
}

function spawnMob(typeId,x,y,homeZoneId,tier=0) {
  const d=MOB_DEFS[typeId], stats=MOB_STATS[typeId];
  const t=Math.max(0,Math.min(13,tier));
  const maxHp=stats?stats.hp[t]:50, damage=stats?stats.dmg[t]:10, armor=stats?stats.armor[t]:0;
  const contactDps=damage*(d.dpsFactor??1.0), rarity=RARITIES[t];
  const xp=Math.ceil(d.xp*(1+t*3));
  const scale=RADIUS_SCALE[t]??1;
  const baseRadius=Math.max(1,Math.round(d.radius*scale));
  // For mobs with an oval body, hitbox circle is sized to match body front-to-back extent
  const hitFactor=d.hitRadiusFactor??1.0;
  const radius=Math.max(1,Math.round(baseRadius*hitFactor));
  const drawRadius=baseRadius;  // visual drawing size is always the base
  const mass=Math.max(1,Math.round(d.mass*(MASS_SCALE[t]??1)));
  const mob={
    id:nextMobId++, typeId, name:d.name, rarity, homeZoneId, x, y,
    radius, drawRadius, hp:maxHp, maxHp, damage, contactDps, armor,
    baseSpeed:d.speed*Math.sqrt(scale), speed:d.speed*Math.sqrt(scale), alertSpeed:(d.alertSpeed||d.speed)*Math.sqrt(scale),
    color:d.color, border:d.border, xp,
    aggroRange: d.aggroRange>0 ? Math.max(radius*2, Math.round(d.aggroRange * (1 + t * AGGRO_TIER_SCALE))) : 0,
    mass,
    hitOffsetX: (d.hitOffsetX || 0) * scale,
    hitOffsetY: (d.hitOffsetY || 0) * scale,
    wanderAngle:Math.random()*Math.PI*2, wanderTimer:Math.random()*2000,
    webTimer:1500, alerted:false, dead:false,
    facing:Math.random()*Math.PI*2, targetFacing:0,
    legPhase:0, wobblePhase:0,
    spots:typeId==='ladybug'?generateSpots(d.radius):[],
    chainId:null, segIndex:null, isCentipede:false,
    tier:t,
  };
  // ── Hornet-specific state ──────────────────────────────────────────────────
  if (typeId==='hornet') {
    mob.shootState    = 'idle';   // 'idle' | 'approach' | 'aim' | 'fire' | 'reset'
    mob.shootTimer    = 0;
    mob.stingerProgress = 1;      // 1 = full stinger, 0 = just fired (regrowing)
  }
  // ── Ant colony specific state ──────────────────────────────────────────────
  if (typeId==='ant_hole') {
    mob.nextMilestoneHp = Math.round(maxHp * 0.85);  // first milestone at 85% HP
    mob.isAntHole = true;
  }
  if (typeId==='beehive') {
    mob.nextMilestoneHp = Math.round(maxHp * 0.85);  // first milestone at 85% HP
    mob.isBeehive = true;
  }
  if (typeId==='queen_ant') {
    mob.queenLayTimer = 5000;
    mob.queenLayState = 'moving';   // 'moving' | 'pausing'
    mob.queenLayPause = 0;
  }
  if (typeId==='ant_egg') {
    mob.eggHatchTimer = 3500;  // hatches into soldier ant after 3.5s
  }
  if (['soldier_ant','worker_ant','baby_ant','queen_ant','ant_egg','ant_hole'].includes(typeId)) {
    mob.pincerPhase = 0;
    mob.wingPhase   = 0;
    mob.isAntMob    = true;
  }
  if (typeId==='digger') {
    mob.state = 'neutral';  // 'neutral' | 'sad' | 'angry'
    mob.cutterRot = 0;
    mob.eyeAngle = 0;
    mob.browT = 0;          // 0 = no eyebrows, 1 = full angry eyebrows
    // Animation state for smooth transitions
    mob.animPdx = 0;
    mob.animPdy = 0;
    mob.animCpOffset = mob.drawRadius * 0.14; // Start with neutral smile (world units)
  }
  if (typeId==='beekeeper') {
    mob.state = 'neutral';  // 'neutral' | 'sad' | 'angry'
    mob.cutterRot = 0;
    mob.eyeAngle = 0;
    mob.browT = 0;          // 0 = neutral mouth (circle), 1 = angry mouth (frown)
    mob.animPdx = 0;
    mob.animPdy = 0;
  }
  mobs.push(mob);
  return mob;
}

function spawnCentipede(x,y,homeZoneId,tier) {
  const segCount=4+Math.floor(Math.random()*7);  // 4–10 body segments (not counting head)
  const chainId=nextChainId++;
  const chainArr=[];
  const initAngle=Math.random()*Math.PI*2;

  const head=spawnMob('centipede_head',x,y,homeZoneId,tier);
  head.chainId=chainId; head.segIndex=0; head.isCentipede=true;
  head.facing=initAngle; head.wanderAngle=initAngle;
  chainArr.push(head);
  zoneStates[homeZoneId].mobIds.add(head.id);

  const segSpacing=head.radius*2.05;
  // Place each segment behind the previous one, stepping in small increments
  // to avoid clipping through walls — if blocked, try adjacent angles
  let prevX=x, prevY=y;
  for(let i=0;i<segCount;i++){
    let placed=false;
    // Try the natural trailing direction first, then small angle offsets
    for(let attempt=0;attempt<12;attempt++){
      const tryAngle = initAngle + Math.PI + (attempt===0?0:(attempt%2===0?1:-1)*Math.ceil(attempt/2)*0.25);
      const bx=prevX+Math.cos(tryAngle)*segSpacing;
      const by=prevY+Math.sin(tryAngle)*segSpacing;
      if(canMoveTo(bx,by,head.radius)){
        const body=spawnMob('centipede_body',bx,by,homeZoneId,tier);
        body.chainId=chainId; body.segIndex=i+1; body.isCentipede=true;
        body.facing=initAngle;
        chainArr.push(body);
        prevX=bx; prevY=by;
        placed=true;
        break;
      }
    }
    if(!placed) break; // can't fit more segments — stop early
  }
  centipedeChains.set(chainId,{id:chainId,mobs:chainArr,alerted:false});
  const headZoneState = zoneStates[homeZoneId];
  if(headZoneState) headZoneState.centipedeCount = (headZoneState.centipedeCount||0)+1;
  return head;
}

function triggerZoneDeath(mob) {
  const state=zoneStates[mob.homeZoneId];
  if(!state) return;
  state.mobIds.delete(mob.id);
  state.deaths++;
  if(state.deaths>=getDeathTrigger(mob.homeZoneId)&&!state.spawning){
    state.spawning=true; state.spawnAccum=0; state.deaths=0;
  }
}

// Spawn an ant minion near a position, NOT tracked by the zone mob cap
function spawnAntMinion(typeId, nearX, nearY, homeX, homeY, zoneId, tier) {
  const def=MOB_DEFS[typeId];
  if(!def) return null;
  let mx=nearX, my=nearY;
  for(let attempt=0;attempt<16;attempt++){
    const angle=Math.random()*Math.PI*2;
    const dist=50+Math.random()*130;
    const tx=nearX+Math.cos(angle)*dist, ty=nearY+Math.sin(angle)*dist;
    if(canMoveTo(tx,ty,def.radius)){mx=tx;my=ty;break;}
  }
  const mob=spawnMob(typeId,mx,my,zoneId,tier);
  mob.homeX=homeX; mob.homeY=homeY; mob.isZoneTracked=false;
  return mob;
}

// Spawn ant hole initial minions
function spawnAntHoleMinions(holeX, holeY, zoneId, tier) {
  spawnAntMinion('soldier_ant',holeX,holeY,holeX,holeY,zoneId,tier);
  spawnAntMinion('worker_ant', holeX,holeY,holeX,holeY,zoneId,tier);
  spawnAntMinion('baby_ant',   holeX,holeY,holeX,holeY,zoneId,tier);
}

function handleCentipedeSegmentDeath(deadMob) {
  const chain=centipedeChains.get(deadMob.chainId);
  if(!chain) return;
  const idx=chain.mobs.indexOf(deadMob);
  if(idx===-1) return;
  chain.mobs.splice(idx,1);

  if(chain.mobs.length===0){
    centipedeChains.delete(deadMob.chainId);
    triggerZoneDeath(deadMob); // dead was the head, is in mobIds
    const st=zoneStates[deadMob.homeZoneId];
    if(st) st.centipedeCount=Math.max(0,(st.centipedeCount||1)-1);
    return;
  }

  if(idx===0){
    // Head died — promote next segment as chain leader, but keep its body drawing
    const newHead=chain.mobs[0];
    newHead.isChainHead=true;       // AI treats this as head
    newHead.isCentipede=true;
    newHead.alerted=chain.alerted;
    newHead.segIndex=0;
    newHead.aggroRange=MOB_DEFS.centipede_head.aggroRange;
    // typeId stays 'centipede_body' — drawing does NOT change
    // Update remaining body segment indices
    for(let i=1;i<chain.mobs.length;i++) chain.mobs[i].segIndex=i;
    const state=zoneStates[deadMob.homeZoneId];
    if(state){ state.mobIds.delete(deadMob.id); state.mobIds.add(newHead.id); }
  } else if(idx<chain.mobs.length){
    // Middle segment died — split into two chains
    const rightMobs=chain.mobs.splice(idx);
    if(rightMobs.length>0){
      const newChainId=nextChainId++;
      // First right-side segment becomes chain leader — body drawing stays
      const newHead=rightMobs[0];
      newHead.isChainHead=true;
      newHead.isCentipede=true;
      newHead.alerted=chain.alerted;
      newHead.segIndex=0;
      newHead.aggroRange=MOB_DEFS.centipede_head.aggroRange;
      // Ensure all right-side segments are body type
      for(let i=0;i<rightMobs.length;i++){
        rightMobs[i].segIndex=i;
        rightMobs[i].typeId='centipede_body';
        rightMobs[i].isChainHead=(i===0);
      }
      const newChain={id:newChainId,mobs:rightMobs,alerted:chain.alerted};
      centipedeChains.set(newChainId,newChain);
      for(const m of rightMobs) m.chainId=newChainId;
      const state=zoneStates[newHead.homeZoneId];
      if(state) { state.mobIds.add(newHead.id); state.centipedeCount=(state.centipedeCount||1)+1; }
      // Fix left-side segment indices
      for(let i=0;i<chain.mobs.length;i++) chain.mobs[i].segIndex=i;
    }
  }
  // tail died: nothing extra needed
}

function onMobDied(mob) {
  if(mob.homeZoneId==null) return;
  if(mob.isCentipede){ handleCentipedeSegmentDeath(mob); return; }
  // Ant minions not tracked by zone cap — no zone bookkeeping needed
  if(mob.isZoneTracked===false) return;
  const state=zoneStates[mob.homeZoneId];
  // Ant hole: decrement count and spawn death wave
  if(mob.isAntHole){
    state.mobIds.delete(mob.id);
    state.antHoleCount=Math.max(0,(state.antHoleCount||1)-1);
    state.deaths++;
    if(state.deaths>=getDeathTrigger(mob.homeZoneId)&&!state.spawning){
      state.spawning=true; state.spawnAccum=0; state.deaths=0;
    }
    // Death wave: 3 soldiers, 3 workers, 1 queen, and 15% chance for 1 digger
    for(let i=0;i<3;i++) spawnAntMinion('soldier_ant',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    for(let i=0;i<3;i++) spawnAntMinion('worker_ant', mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    spawnAntMinion('queen_ant',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    if(Math.random()<0.15) spawnAntMinion('digger',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    return;
  }
  // Beehive: decrement count and spawn death swarm
  if(mob.isBeehive){
    state.mobIds.delete(mob.id);
    state.beehiveCount=Math.max(0,(state.beehiveCount||1)-1);
    state.deaths++;
    if(state.deaths>=getDeathTrigger(mob.homeZoneId)&&!state.spawning){
      state.spawning=true; state.spawnAccum=0; state.deaths=0;
    }
    // Death swarm: 3 bees, 2 hornets, 1 queen bee, 5% chance for beekeeper
    for(let i=0;i<3;i++) spawnAntMinion('bee',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    for(let i=0;i<2;i++) spawnAntMinion('hornet',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    spawnAntMinion('queen_bee',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    if(Math.random()<0.05) spawnAntMinion('beekeeper',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    return;
  }
  state.mobIds.delete(mob.id);
  state.deaths++;
  if(state.deaths>=getDeathTrigger(mob.homeZoneId)&&!state.spawning){
    state.spawning=true; state.spawnAccum=0; state.deaths=0;
  }
}

// ── Friendly ant pet spawner (called by petals.js ant egg logic) ──────────────
// Hand-tuned leash distances per tier — Common-Legendary stay tight (900),
// Mythical+ opens up without the ring going off-screen.
const PET_LEASH_BY_TIER = [900,900,900,900,900,1500,2500,3500,4200,5000,6500,7000,7000,7000];
export function getPetLeashDist(tier) {
  return PET_LEASH_BY_TIER[Math.max(0,Math.min(13,tier??0))];
}

// Called by combat.js when a centipede segment takes damage — immediately alerts
// the whole chain so the propagation doesn't have to wait until next tick.
export function alertChainByMob(mob) {
  if (!mob.chainId) return;
  const chain = centipedeChains.get(mob.chainId);
  if (!chain || chain.alerted) return;
  chain.alerted = true;
  for (const m of chain.mobs) { m.alerted = true; }
}

export function spawnFriendlyAntPet(tier, x, y, slotIdx, pieceIdx) {
  const zoneId = getZoneId(x, y);  // use the actual zone the player is in, not hardcoded 0
  const mob = spawnMob('soldier_ant', x, y, zoneId, tier);
  mob.isFriendlyPet        = true;
  mob.isZoneTracked        = false;
  mob.linkedPieceSlotIdx   = slotIdx;
  mob.linkedPieceIdx       = pieceIdx;
  mob.homeX                = undefined;
  mob.homeY                = undefined;
  mob.border               = '#22cc55';  // green border — visually friendly
  return mob;
}

export function spawnFriendlyBeePet(tier, x, y, slotIdx, pieceIdx) {
  const zoneId = getZoneId(x, y);
  const mob = spawnMob('bee', x, y, zoneId, tier);
  mob.isFriendlyPet        = true;
  mob.isZoneTracked        = false;
  mob.linkedPieceSlotIdx   = slotIdx;
  mob.linkedPieceIdx       = pieceIdx;
  mob.homeX                = undefined;
  mob.homeY                = undefined;
  mob.border               = '#22cc55';  // green border — visually friendly
  return mob;
}

export function spawnFriendlyDiggerPet(tier, x, y, slotIdx, pieceIdx, bodyColor) {
  const zoneId = getZoneId(x, y);
  const mob = spawnMob('digger', x, y, zoneId, tier);
  mob.isFriendlyPet        = true;
  mob.isZoneTracked        = false;
  mob.linkedPieceSlotIdx   = slotIdx;
  mob.linkedPieceIdx       = pieceIdx;
  mob.homeX                = undefined;
  mob.homeY                = undefined;
  mob.border               = '#22cc55';  // green border — visually friendly
  mob.bodyColor            = bodyColor;  // player's inner color
  return mob;
}

export function initMobs(playerX,playerY) {
  mobs.length=0; missiles.length=0; centipedeChains.clear(); nextMobId=0; nextChainId=0;
  for(const state of zoneStates){
    state.mobIds.clear(); state.deaths=0; state.spawning=false;
    state.spawnAccum=0; state.checkTimer=ZONE_CHECK_INTERVAL; state.centipedeCount=0; state.antHoleCount=0; state.beehiveCount=0;
    state.activated=false;
  }
  // Zones start empty — they activate and fill when a player first enters them
}

function trySpawnInZone(zoneId,playerX,playerY) {
  const cfg=ZONE_CONFIG[zoneId];
  if(!cfg||cfg.rarity===null) return false;
  const targetRar=pickSpawnRarity(cfg.tier,RARITIES);
  const targetTier=RARITIES.indexOf(targetRar);

  const CENTI_MAX_PER_ZONE = 4;
  const ANT_HOLE_MAX_PER_ZONE = 1;
  const BEEHIVE_MAX_PER_ZONE = 1;
  const roll=Math.random();

  if(roll<0.08){
    // Ant hole spawn
    const state=zoneStates[zoneId];
    if((state?.antHoleCount||0)>=ANT_HOLE_MAX_PER_ZONE) return false;
    const pos=findSpawnInZone(zoneId,60,playerX,playerY,mobs,MOB_SAFE_RADIUS);
    if(!pos) return false;
    const hole=spawnMob('ant_hole',pos.x,pos.y,zoneId,targetTier);
    zoneStates[zoneId].mobIds.add(hole.id);
    zoneStates[zoneId].antHoleCount=(zoneStates[zoneId].antHoleCount||0)+1;
    spawnAntHoleMinions(pos.x,pos.y,zoneId,targetTier);
    return true;
  }

  if(roll<0.15){
    // Beehive spawn
    const state=zoneStates[zoneId];
    if((state?.beehiveCount||0)>=BEEHIVE_MAX_PER_ZONE) return false;
    const pos=findSpawnInZone(zoneId,80,playerX,playerY,mobs,MOB_SAFE_RADIUS);
    if(!pos) return false;
    const hive=spawnMob('beehive',pos.x,pos.y,zoneId,targetTier);
    zoneStates[zoneId].mobIds.add(hive.id);
    zoneStates[zoneId].beehiveCount=(zoneStates[zoneId].beehiveCount||0)+1;
    // Spawn 2 bees as initial guards
    for(let i=0;i<2;i++) spawnAntMinion('bee',pos.x,pos.y,pos.x,pos.y,zoneId,targetTier);
    return true;
  }

  if(roll<0.28){
    const state=zoneStates[zoneId];
    if((state?.centipedeCount||0)>=CENTI_MAX_PER_ZONE) return false;
    // Use a large clearance so the full chain tail doesn't land on another mob
    const pos=findSpawnInZone(zoneId,500,playerX,playerY,mobs,MOB_SAFE_RADIUS);
    if(!pos) return false;
    spawnCentipede(pos.x,pos.y,zoneId,targetTier);
    return true;
  }

  const typeId=getRandomMobType(), def=MOB_DEFS[typeId];
  const pos=findSpawnInZone(zoneId,def.radius,playerX,playerY,mobs,MOB_SAFE_RADIUS);
  if(!pos) return false;
  const mob=spawnMob(typeId,pos.x,pos.y,zoneId,targetTier);
  zoneStates[zoneId].mobIds.add(mob.id);
  return true;
}

function updateZoneSpawning(dt,playerX,playerY) {
  for(const state of zoneStates){
    // Activate zone the first time a player enters it
    if(!state.activated){
      const b=getZoneBounds(state.zoneId);
      if(playerX>=b.x0&&playerX<=b.x1&&playerY>=b.y0&&playerY<=b.y1){
        state.activated=true;
        state.spawning=true; state.spawnAccum=0;
      } else {
        continue; // zone not yet visited — skip entirely
      }
    }
    const zoneMax=getZoneMobMax(state.zoneId);
    state.checkTimer-=dt;
    if(state.checkTimer<=0){
      state.checkTimer=ZONE_CHECK_INTERVAL;
      if(state.mobIds.size<zoneMax&&!state.spawning){ state.spawning=true; state.spawnAccum=0; }
    }
    if(!state.spawning) continue;
    state.spawnAccum+=dt;
    while(state.spawnAccum>=SPAWN_DRIP_INTERVAL){
      state.spawnAccum-=SPAWN_DRIP_INTERVAL;
      if(state.mobIds.size>=zoneMax){ state.spawning=false; state.deaths=0; break; }
      trySpawnInZone(state.zoneId,playerX,playerY);
    }
  }
}

export function updateMobs(dt,playerX,playerY) {
  const AI_CULL_DIST=9000;

  // Despawn check
  for(const mob of mobs){
    if(mob.dead) continue;
    if(Math.abs(getZoneTier(mob.homeZoneId)-getZoneTier(getZoneId(mob.x,mob.y)))>=2) mob.dead=true;
  }

  // ── Centipede chain AI ────────────────────────────────────────────────────
  const DEAGGRO_DIST = 1200; // player must get this far away to lose aggro
  // Collect live diggers once — used by centipede AI and other mob AI loops
  const diggers = mobs.filter(m => !m.dead && (m.typeId === 'digger' || m.typeId === 'beekeeper' || m.isFriendlyPet));
  // No PET_VIEW_RADIUS cap — enemy mobs aggro to friendly pets at any distance
  for(const [,chain] of centipedeChains){
    if(chain.mobs.length===0) continue;
    // Propagate alerted state
    if(!chain.alerted&&chain.mobs.some(m=>m.alerted)){
      chain.alerted=true; for(const m of chain.mobs) m.alerted=true;
    }
    const head=chain.mobs[0];
    if(!head||head.dead) continue;

    // Pick nearest target: player or any live digger
    let chainTargetX=playerX,chainTargetY=playerY;
    let chainBestDist=Math.hypot(playerX-head.x,playerY-head.y);
    for(const dg of diggers){const dd=Math.hypot(dg.x-head.x,dg.y-head.y);if(dd<chainBestDist){chainTargetX=dg.x;chainTargetY=dg.y;chainBestDist=dd;}}

    const dx=chainTargetX-head.x, dy=chainTargetY-head.y, dist=Math.hypot(dx,dy);

    // Auto-aggro if any chain segment is within range of the target
    if(!chain.alerted){
      const aggroR=head.aggroRange||280;
      for(const seg of chain.mobs){
        if(Math.hypot(chainTargetX-seg.x,chainTargetY-seg.y)<aggroR){
          chain.alerted=true; for(const m of chain.mobs) m.alerted=true; break;
        }
      }
    }

    // De-aggro if player escapes leash distance
    if(chain.alerted && dist>DEAGGRO_DIST){
      chain.alerted=false; for(const m of chain.mobs){ m.alerted=false; m.wanderAngle=m.facing; m.wanderTimer=800; }
    }

    if(dist<=AI_CULL_DIST){
      const chasing=chain.alerted&&dist>0.01;
      head.speed=chasing?head.alertSpeed:head.baseSpeed;
      
      // Apply web slowdown
      const slowFactorC = getWebSlowdownFactor(head.x, head.y);
      head.speed *= (1 - slowFactorC);
      
      let newX=head.x, newY=head.y;

      // Max turn per frame — prevents head from doing U-turns into its own body
      const MAX_TURN=2.7;

      if(chasing){
        let wantFacing=Math.atan2(dy,dx);
        let tdiff=wantFacing-head.facing;
        if(tdiff>Math.PI) tdiff-=Math.PI*2; if(tdiff<-Math.PI) tdiff+=Math.PI*2;
        tdiff=Math.max(-MAX_TURN,Math.min(MAX_TURN,tdiff));
        head.targetFacing=head.facing+tdiff;
        newX=head.x+Math.cos(head.targetFacing)*head.speed;
        newY=head.y+Math.sin(head.targetFacing)*head.speed;
      } else {
        head.wanderTimer-=dt;
        if(head.wanderTimer<=0){
          // New wander direction: at most 90° turn from current facing to prevent U-turns
          const turn=(Math.random()-0.5)*Math.PI*0.9;
          head.wanderAngle=head.facing+turn;
          head.wanderTimer=1200+Math.random()*2500;
        }
        head.targetFacing=head.wanderAngle;
        newX=head.x+Math.cos(head.wanderAngle)*head.speed*0.45;
        newY=head.y+Math.sin(head.wanderAngle)*head.speed*0.45;
      }
      if(canMoveTo(newX,newY,head.radius)){ head.x=newX; head.y=newY; }
      else {
        // Head hit a wall — pick a new wander direction away from it
        head.wanderAngle=head.facing+Math.PI*(0.5+Math.random());
        head.wanderTimer=600+Math.random()*800;
      }

      // Smooth head facing
      let diff=head.targetFacing-head.facing;
      if(diff>Math.PI) diff-=Math.PI*2; if(diff<-Math.PI) diff+=Math.PI*2;
      head.facing+=diff*0.08;
      const legSpeed = chasing ? 0.14 : 0.06;
      head.legPhase=(head.legPhase||0)+legSpeed;

      // Body following — segments smoothly follow their parent
      for(let i=1;i<chain.mobs.length;i++){
        const seg=chain.mobs[i], parent=chain.mobs[i-1];
        if(!seg||seg.dead||!parent||parent.dead) continue;
        const ddx=parent.x-seg.x, ddy=parent.y-seg.y, ddist=Math.hypot(ddx,ddy);
        const desired=(parent.radius+seg.radius)*1.05;
        const prevX=seg.x, prevY=seg.y;
        if(ddist>desired&&ddist>0.001){
          const excess=ddist-desired;
          const nx=ddx/ddist, ny=ddy/ddist;
          const tx=seg.x+nx*excess, ty=seg.y+ny*excess;
          // Only move if the new position is valid (not in a wall)
          if(canMoveTo(tx,ty,seg.radius)){ seg.x=tx; seg.y=ty; }
          else {
            // Try moving only on x or y axis to slide along walls
            if(canMoveTo(tx,seg.y,seg.radius)) seg.x=tx;
            else if(canMoveTo(seg.x,ty,seg.radius)) seg.y=ty;
          }
          // Smoothly rotate toward travel direction
          const wantFacing=Math.atan2(ddy,ddx);
          let fd=wantFacing-seg.facing;
          if(fd>Math.PI) fd-=Math.PI*2; if(fd<-Math.PI) fd+=Math.PI*2;
          seg.facing+=fd*0.18;
        }
        seg.targetFacing=seg.facing;
        // Only animate legs if this segment actually moved this frame
        const moved=Math.hypot(seg.x-prevX,seg.y-prevY)>0.05;
        if(moved) seg.legPhase=(seg.legPhase||0)+legSpeed;

        // Soft collision: head (i=0) and segment 1 — prevent full overlap without flinging
        if(i===1){
          const hx=head.x-seg.x, hy=head.y-seg.y, hd=Math.hypot(hx,hy);
          const minSep=head.radius+seg.radius;
          if(hd<minSep&&hd>0.001){
            // Gently push segment away from head (soft, low-strength)
            const overlap=(minSep-hd)*0.3;
            const nx=hx/hd, ny=hy/hd;
            const tx=seg.x-nx*overlap, ty=seg.y-ny*overlap;
            if(canMoveTo(tx,ty,seg.radius)){ seg.x=tx; seg.y=ty; }
          }
        }
      }
    }
  }

  // ── Regular mob AI ───────────────────────────────────────────────────────-

  for(const mob of mobs){
    if(mob.dead||mob.isCentipede) continue;
    if(mob.typeId==='hornet') continue;  // handled below
    if(mob.typeId==='digger'||mob.typeId==='beekeeper') continue;  // friendly mobs handled separately
    if(mob.isAntMob) continue;  // ants handled in dedicated section below
    if(mob.typeId==='beehive') continue;  // static, no AI needed
    if(mob.typeId==='queen_bee') continue;  // handled in dedicated section below
    if(mob.isFriendlyPet) continue;  // friendly pets handled in dedicated section below
    // Honeycomb override: if attracted to a honeycomb entity, target it instead
    if (mob.honeycombTargetId != null) {
      const hc = honeycombEntities.find(e => e.id === mob.honeycombTargetId && !e.dead);
      if (hc) {
        const hcDx = hc.x - mob.x, hcDy = hc.y - mob.y;
        const hcDist = Math.hypot(hcDx, hcDy);
        mob.alerted = true;
        mob.speed   = mob.alertSpeed || mob.baseSpeed;
        const slowFactor = getWebSlowdownFactor(mob.x, mob.y);
        mob.speed *= (1 - slowFactor);
        mob.targetFacing = Math.atan2(hcDy, hcDx);
        if (hcDist > mob.radius + hc.radius && hcDist > 0.001) {
          const nx = hcDx / hcDist, ny = hcDy / hcDist;
          const nx2 = mob.x + nx * mob.speed, ny2 = mob.y + ny * mob.speed;
          if (canMoveTo(nx2, ny2, mob.radius)) { mob.x = nx2; mob.y = ny2; }
        }
        continue;
      } else {
        mob.honeycombTargetId = null;
      }
    }
    // Pick nearest target: player or any live digger (whichever is closer)
    let targetX=playerX,targetY=playerY;
    let tDist2=Math.hypot(playerX-mob.x,playerY-mob.y);
    for(const dg of diggers){const dd=Math.hypot(dg.x-mob.x,dg.y-mob.y);if(dd<tDist2){targetX=dg.x;targetY=dg.y;tDist2=dd;}}
    const dx=targetX-mob.x, dy=targetY-mob.y, dist=Math.hypot(dx,dy);
    if(dist>AI_CULL_DIST) continue;

    // De-aggro if player gets far enough away
    if(mob.alerted && dist>DEAGGRO_DIST){
      mob.alerted=false; mob.wanderAngle=mob.facing; mob.wanderTimer=800;
    }

    let chasing=false;
    if(mob.aggroRange>0&&dist<mob.aggroRange&&dist>0.01){chasing=true;mob.alerted=true;mob.speed=mob.alertSpeed||mob.baseSpeed;}
    else if(mob.alerted){chasing=true;mob.speed=mob.alertSpeed||mob.baseSpeed;}
    else mob.speed=mob.baseSpeed;
    
    // Apply web slowdown
    const slowFactor = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactor);
    
    mob.targetFacing=chasing?Math.atan2(dy,dx):mob.wanderAngle;
    if(mob.typeId==='spider'&&chasing){
      mob.webTimer-=dt;
      if(mob.webTimer<=0){
        // Spawn a web slightly smaller than the spider's visible body
        spawnWebField(mob.x, mob.y, mob.tier ?? 0, (mob.drawRadius ?? mob.radius) * 0.65);
        mob.webTimer += 1500;
      }
    }
    let newX=mob.x, newY=mob.y;
    if(chasing&&dist>0.01){newX=mob.x+(dx/dist)*mob.speed;newY=mob.y+(dy/dist)*mob.speed;}
    else{
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
      newX=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      newY=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
    }
    if(canMoveTo(newX,newY,mob.radius)){mob.x=newX;mob.y=newY;}
  }

  // Digger AI — friendly to player, targets nearest hostile mob
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='digger'||mob.isFriendlyPet) continue;
    const pdist=Math.hypot(playerX-mob.x,playerY-mob.y);
    if(pdist>AI_CULL_DIST) continue;

    const DIGGER_LEASH = getPetLeashDist(mob.tier);
    const DIGGER_LEASH_GRACE = DIGGER_LEASH * 1.35;

    // Leash return — overrides everything else if too far from player
    if(pdist > DIGGER_LEASH_GRACE){
      mob.alerted=false;
      const ldx=playerX-mob.x, ldy=playerY-mob.y;
      mob.targetFacing=Math.atan2(ldy,ldx);
      const overleash=Math.min((pdist-DIGGER_LEASH_GRACE)/300,1);
      mob.speed=mob.baseSpeed+(mob.alertSpeed-mob.baseSpeed)*overleash;
      const slowFactor=getWebSlowdownFactor(mob.x,mob.y);
      mob.speed*=(1-slowFactor);
      const excess=pdist-DIGGER_LEASH;
      const step=Math.min(mob.speed,excess);
      const lnx=mob.x+(ldx/pdist)*step, lny=mob.y+(ldy/pdist)*step;
      if(canMoveTo(lnx,lny,mob.radius)){mob.x=lnx;mob.y=lny;}
      mob.eyeAngle=mob.targetFacing;
      const targetPdxL=Math.cos(mob.eyeAngle)*mob.drawRadius*0.09;
      const targetPdyL=Math.sin(mob.eyeAngle)*mob.drawRadius*0.09;
      mob.animPdx=mob.animPdx*0.85+targetPdxL*0.15;
      mob.animPdy=mob.animPdy*0.85+targetPdyL*0.15;
      mob.state='neutral';
      const targetBrowTL=0;
      mob.browT=(mob.browT??0)*0.88+targetBrowTL*0.12;
      const drL=mob.drawRadius;
      mob.animCpOffset=mob.animCpOffset*0.85+(drL*0.14)*0.15;
      mob.cutterRot=(mob.cutterRot||0)+0.03;
      continue;
    }

    // Find nearest non-digger, non-egg mob to chase
    let target=null, targetDist=Infinity;
    for(const other of mobs){
      if(other.dead||other.id===mob.id||other.typeId==='digger'||other.typeId==='beekeeper'||other.typeId==='ant_egg'||other.isFriendlyPet) continue;
      const td=Math.hypot(other.x-mob.x,other.y-mob.y);
      if(td<targetDist){targetDist=td;target=other;}
    }

    let chasing=false;
    let tdx=0,tdy=0,dist=0;
    if(target&&targetDist<mob.aggroRange){
      tdx=target.x-mob.x; tdy=target.y-mob.y; dist=targetDist;
      chasing=true; mob.alerted=true; mob.speed=mob.alertSpeed||mob.baseSpeed;
    } else if(mob.alerted&&(!target||targetDist>DEAGGRO_DIST)){
      mob.alerted=false; mob.wanderAngle=mob.facing; mob.wanderTimer=800; mob.state='neutral';
      mob.speed=mob.baseSpeed;
    } else {
      mob.speed=mob.baseSpeed;
    }
    
    // Apply web slowdown
    const slowFactor = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactor);
    
    mob.targetFacing=chasing?Math.atan2(tdy,tdx):mob.wanderAngle;

    // Eye tracking follows movement direction
    const moveX=chasing?tdx/(dist||1):Math.cos(mob.wanderAngle);
    const moveY=chasing?tdy/(dist||1):Math.sin(mob.wanderAngle);
    if(moveX!==0||moveY!==0) mob.eyeAngle=Math.atan2(moveY,moveX);

    // Smooth eye animation
    const targetPdx=Math.cos(mob.eyeAngle)*mob.drawRadius*0.09;
    const targetPdy=Math.sin(mob.eyeAngle)*mob.drawRadius*0.09;
    mob.animPdx=mob.animPdx*0.85+targetPdx*0.15;
    mob.animPdy=mob.animPdy*0.85+targetPdy*0.15;

    // State based on HP + chasing
    const hpPct=mob.hp/mob.maxHp;
    if(hpPct<0.3){ mob.state='sad'; }
    else if(chasing){ mob.state='angry'; }
    else { mob.state='neutral'; }

    // Animate eyebrows (browT: 0=hidden → 1=angry)
    const targetBrowT=mob.state==='angry'?1:0;
    mob.browT=(mob.browT??0)*0.88+targetBrowT*0.12;

    // Smooth mouth animation
    const dr=mob.drawRadius;
    const targetCpOffset=mob.state==='angry'?-dr*0.20:mob.state==='sad'?-dr*0.13:dr*0.14;
    mob.animCpOffset=mob.animCpOffset*0.85+targetCpOffset*0.15;

    // Cutter rotation — faster when chasing
    mob.cutterRot=(mob.cutterRot||0)+(chasing?0.08:0.03);

    let newX=mob.x, newY=mob.y;
    if(chasing&&dist>0.01){newX=mob.x+(tdx/dist)*mob.speed;newY=mob.y+(tdy/dist)*mob.speed;}
    else{
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
      // Soft drift back toward player when outside leash ring
      if(pdist>DIGGER_LEASH){
        const excess=pdist-DIGGER_LEASH;
        const toPlayerAngle=Math.atan2(playerY-mob.y,playerX-mob.x);
        let aDiff=toPlayerAngle-mob.wanderAngle;
        if(aDiff>Math.PI) aDiff-=Math.PI*2; if(aDiff<-Math.PI) aDiff+=Math.PI*2;
        mob.wanderAngle+=aDiff*(0.08+0.12*Math.min(excess/300,1));
      }
      newX=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      newY=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
    }
    if(canMoveTo(newX,newY,mob.radius)){mob.x=newX;mob.y=newY;}
  }

  // Beekeeper AI — friendly to player, targets nearest hostile mob (like digger)
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='beekeeper') continue;
    const pdist=Math.hypot(playerX-mob.x,playerY-mob.y);
    if(pdist>AI_CULL_DIST) continue;

    // Find nearest non-beekeeper, non-egg mob to chase
    let target=null, targetDist=Infinity;
    for(const other of mobs){
      if(other.dead||other.id===mob.id||other.typeId==='beekeeper'||other.typeId==='digger'||other.typeId==='ant_egg'||other.isFriendlyPet) continue;
      const td=Math.hypot(other.x-mob.x,other.y-mob.y);
      if(td<targetDist){targetDist=td;target=other;}
    }

    let chasing=false;
    let tdx=0,tdy=0,dist=0;
    if(target&&targetDist<mob.aggroRange){
      tdx=target.x-mob.x; tdy=target.y-mob.y; dist=targetDist;
      chasing=true; mob.alerted=true; mob.speed=mob.alertSpeed||mob.baseSpeed;
    } else if(mob.alerted&&(!target||targetDist>DEAGGRO_DIST)){
      mob.alerted=false; mob.wanderAngle=mob.facing; mob.wanderTimer=800; mob.state='neutral';
      mob.speed=mob.baseSpeed;
    } else {
      mob.speed=mob.baseSpeed;
    }
    
    // Apply web slowdown
    const slowFactorBK = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactorBK);
    
    mob.targetFacing=chasing?Math.atan2(tdy,tdx):mob.wanderAngle;

    // Eye tracking follows movement direction
    const moveX=chasing?tdx/(dist||1):Math.cos(mob.wanderAngle);
    const moveY=chasing?tdy/(dist||1):Math.sin(mob.wanderAngle);
    if(moveX!==0||moveY!==0) mob.eyeAngle=Math.atan2(moveY,moveX);

    // Smooth eye animation (pupils drift to edges — 0.15 lets them reach iris edge)
    const targetPdx=Math.cos(mob.eyeAngle)*mob.drawRadius*0.15;
    const targetPdy=Math.sin(mob.eyeAngle)*mob.drawRadius*0.15;
    mob.animPdx=mob.animPdx*0.85+targetPdx*0.15;
    mob.animPdy=mob.animPdy*0.85+targetPdy*0.15;
    const hpPct=mob.hp/mob.maxHp;
    if(hpPct<0.3){ mob.state='sad'; }
    else if(chasing){ mob.state='angry'; }
    else { mob.state='neutral'; }

    // Mouth animation (browT: 0=neutral → 1=frown/angry)
    const targetBrowT=mob.state==='angry'?1:0;
    mob.browT=(mob.browT??0)*0.88+targetBrowT*0.12;

    // Cutter rotation — faster when chasing
    mob.cutterRot=(mob.cutterRot||0)+(chasing?0.08:0.03);

    let newX=mob.x, newY=mob.y;
    if(chasing&&dist>0.01){newX=mob.x+(tdx/dist)*mob.speed;newY=mob.y+(tdy/dist)*mob.speed;}
    else{
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
      newX=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      newY=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
    }
    if(canMoveTo(newX,newY,mob.radius)){mob.x=newX;mob.y=newY;}
  }

  // ── Queen Bee AI — hostile to player/beekeeper, heals nearby friendly swarm ──
  // Friendly swarm = bee, hornet, queen_bee (they won't be attacked by her either)
  const QUEEN_BEE_HEAL_INTERVAL = 500; // ms between heal ticks
  const BEE_FRIENDLY_TYPES = new Set(['bee','hornet','queen_bee']);
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='queen_bee') continue;
    const pdist=Math.hypot(playerX-mob.x,playerY-mob.y);
    if(pdist>AI_CULL_DIST) continue;

    // Target: player or beekeeper/digger (whichever is closest)
    let targetX=playerX,targetY=playerY;
    let tDist2q=pdist;
    for(const dg of diggers){const dd=Math.hypot(dg.x-mob.x,dg.y-mob.y);if(dd<tDist2q){targetX=dg.x;targetY=dg.y;tDist2q=dd;}}
    const dx=targetX-mob.x,dy=targetY-mob.y,dist=Math.hypot(dx,dy);

    if(mob.alerted&&dist>DEAGGRO_DIST){mob.alerted=false;mob.wanderAngle=mob.facing;mob.wanderTimer=800;}
    let chasing=false;
    if(mob.alerted){chasing=true;mob.speed=mob.alertSpeed;}
    else if(mob.aggroRange>0&&dist<mob.aggroRange&&dist>0.01){chasing=true;mob.alerted=true;mob.speed=mob.alertSpeed;}
    else mob.speed=mob.baseSpeed;
    
    // Apply web slowdown
    const slowFactorQ = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactorQ);
    
    mob.targetFacing=chasing?Math.atan2(dy,dx):mob.wanderAngle;

    let nqX=mob.x,nqY=mob.y;
    if(chasing&&dist>0.01){nqX=mob.x+(dx/dist)*mob.speed;nqY=mob.y+(dy/dist)*mob.speed;}
    else{
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
      nqX=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      nqY=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
    }
    if(canMoveTo(nqX,nqY,mob.radius)){mob.x=nqX;mob.y=nqY;}

    // Heal aura: every tick heal nearby friendly swarm mobs
    mob.healTimer=(mob.healTimer??0)-dt;
    if(mob.healTimer<=0){
      mob.healTimer=QUEEN_BEE_HEAL_INTERVAL;
      const healAmt=30*Math.pow(3,mob.tier??0)*(QUEEN_BEE_HEAL_INTERVAL/1000);
      for(const other of mobs){
        if(other.dead||other.id===mob.id) continue;
        if(!BEE_FRIENDLY_TYPES.has(other.typeId)) continue;
        const hd=Math.hypot(other.x-mob.x,other.y-mob.y);
        if(hd<mob.aggroRange){
          other.hp=Math.min(other.maxHp,other.hp+healAmt);
        }
      }
    }
  }

  // ── Ant AI ────────────────────────────────────────────────────────────────
  // Home radius scales with tier and mob size so ants always have room to roam
  function getAntHomeRadius(tier) {
    const scale = RADIUS_SCALE[tier ?? 0] ?? 1;
    return Math.max(500, (350 + (tier ?? 0) * 80) * Math.sqrt(scale));
  }

  // Ant hole: damage milestone check — spawn 3 soldiers every 15% HP lost
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='ant_hole') continue;
    if(mob.nextMilestoneHp>0 && mob.hp<=mob.nextMilestoneHp){
      mob.nextMilestoneHp=Math.round(mob.nextMilestoneHp - mob.maxHp*0.15);
      if(mob.nextMilestoneHp<0) mob.nextMilestoneHp=0;
      for(let i=0;i<3;i++) spawnAntMinion('soldier_ant',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    }
  }

  // Beehive: damage milestone check — spawn 2 bees + 1 hornet every 15% HP lost
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='beehive') continue;
    if(mob.nextMilestoneHp>0 && mob.hp<=mob.nextMilestoneHp){
      mob.nextMilestoneHp=Math.round(mob.nextMilestoneHp - mob.maxHp*0.15);
      if(mob.nextMilestoneHp<0) mob.nextMilestoneHp=0;
      for(let i=0;i<2;i++) spawnAntMinion('bee',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
      spawnAntMinion('hornet',mob.x,mob.y,mob.x,mob.y,mob.homeZoneId,mob.tier);
    }
  }

  // Baby ant — always passive, slow wandering, idles a lot
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='baby_ant') continue;
    const dx=playerX-mob.x,dy=playerY-mob.y,dist=Math.hypot(dx,dy);
    if(dist>AI_CULL_DIST) continue;
    mob.alerted=false;
    mob.wanderTimer-=dt;
    if(mob.wanderTimer<=0){
      mob.wanderAngle=Math.random()*Math.PI*2;
      mob.wanderTimer=2500+Math.random()*4500;
    }
    if(mob.homeX!==undefined){
      const hdx=mob.homeX-mob.x,hdy=mob.homeY-mob.y;
      if(Math.hypot(hdx,hdy)>getAntHomeRadius(mob.tier)){mob.wanderAngle=Math.atan2(hdy,hdx);mob.wanderTimer=600;}
    }
    mob.targetFacing=mob.wanderAngle;
    // Apply web slowdown to baby ant
    const slowFactorBaby = getWebSlowdownFactor(mob.x, mob.y);
    const slowBabySpeed = mob.speed * (1 - slowFactorBaby);
    const nbX=mob.x+Math.cos(mob.wanderAngle)*slowBabySpeed*0.35;
    const nbY=mob.y+Math.sin(mob.wanderAngle)*slowBabySpeed*0.35;
    if(canMoveTo(nbX,nbY,mob.radius)){mob.x=nbX;mob.y=nbY;}
    else{mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=400+Math.random()*600;}
  }

  // Worker ant — passive until hit, then chases
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='worker_ant') continue;
    let targetX=playerX,targetY=playerY;
    let tDist2w=Math.hypot(playerX-mob.x,playerY-mob.y);
    for(const dg of diggers){const dd=Math.hypot(dg.x-mob.x,dg.y-mob.y);if(dd<tDist2w){targetX=dg.x;targetY=dg.y;tDist2w=dd;}}
    const dx=targetX-mob.x,dy=targetY-mob.y,dist=Math.hypot(dx,dy);
    if(dist>AI_CULL_DIST) continue;
    if(mob.alerted&&dist>DEAGGRO_DIST){mob.alerted=false;mob.wanderAngle=mob.facing;mob.wanderTimer=800;}
    let chasing=false;
    if(mob.alerted){chasing=true;mob.speed=mob.alertSpeed;}else mob.speed=mob.baseSpeed;
    
    // Apply web slowdown
    const slowFactorW = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactorW);
    
    mob.targetFacing=chasing?Math.atan2(dy,dx):mob.wanderAngle;
    let nwX=mob.x,nwY=mob.y;
    if(chasing&&dist>0.01){nwX=mob.x+(dx/dist)*mob.speed;nwY=mob.y+(dy/dist)*mob.speed;}
    else{
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
      if(mob.homeX!==undefined){
        const hdx=mob.homeX-mob.x,hdy=mob.homeY-mob.y;
        if(Math.hypot(hdx,hdy)>getAntHomeRadius(mob.tier)){mob.wanderAngle=Math.atan2(hdy,hdx);mob.wanderTimer=600;}
      }
      nwX=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      nwY=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
    }
    if(canMoveTo(nwX,nwY,mob.radius)){mob.x=nwX;mob.y=nwY;}
    else{mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=400+Math.random()*600;}
  }

  // Soldier ant — aggros at range
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='soldier_ant'||mob.isFriendlyPet) continue;
    let targetX=playerX,targetY=playerY;
    let tDist2s=Math.hypot(playerX-mob.x,playerY-mob.y);
    for(const dg of diggers){const dd=Math.hypot(dg.x-mob.x,dg.y-mob.y);if(dd<tDist2s){targetX=dg.x;targetY=dg.y;tDist2s=dd;}}
    const dx=targetX-mob.x,dy=targetY-mob.y,dist=Math.hypot(dx,dy);
    if(dist>AI_CULL_DIST) continue;
    if(mob.alerted&&dist>DEAGGRO_DIST){mob.alerted=false;mob.wanderAngle=mob.facing;mob.wanderTimer=800;}
    let chasing=false;
    if(mob.aggroRange>0&&dist<mob.aggroRange&&dist>0.01){chasing=true;mob.alerted=true;mob.speed=mob.alertSpeed||mob.baseSpeed;}
    else if(mob.alerted){chasing=true;mob.speed=mob.alertSpeed||mob.baseSpeed;}
    else mob.speed=mob.baseSpeed;
    
    // Apply web slowdown
    const slowFactorS = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactorS);
    
    mob.targetFacing=chasing?Math.atan2(dy,dx):mob.wanderAngle;
    let nsX=mob.x,nsY=mob.y;
    if(chasing&&dist>0.01){nsX=mob.x+(dx/dist)*mob.speed;nsY=mob.y+(dy/dist)*mob.speed;}
    else{
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
      if(mob.homeX!==undefined){
        const hdx=mob.homeX-mob.x,hdy=mob.homeY-mob.y;
        if(Math.hypot(hdx,hdy)>getAntHomeRadius(mob.tier)){mob.wanderAngle=Math.atan2(hdy,hdx);mob.wanderTimer=600;}
      }
      nsX=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      nsY=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
    }
    if(canMoveTo(nsX,nsY,mob.radius)){mob.x=nsX;mob.y=nsY;}
    else{mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=400+Math.random()*600;}
  }

  // ── Friendly ant pet AI ───────────────────────────────────────────────────────
  // Friendly pets chase enemies within aggro range, idle/wander near player otherwise.
  // They never attack diggers, beekeepers, or other friendly pets.
  const PET_FOLLOW_DIST   = 180;   // idle within this radius of player
  const PET_AGGRO_RANGE   = 1400;  // scan for enemies within this distance of the pet itself
  const PET_DEAGGRO_RANGE = 1700;  // hysteresis — keep chasing until target is this far from the pet

  for(const mob of mobs){
    if(mob.dead||!mob.isFriendlyPet) continue;
    const pdist=Math.hypot(playerX-mob.x,playerY-mob.y);
    if(pdist>AI_CULL_DIST) continue;

    const PET_LEASH_DIST       = getPetLeashDist(mob.tier);
    // Grace zone: if the pet already has a live target it can chase up to this
    // far from the player before being forced home — prevents twitch at boundary.
    const PET_LEASH_GRACE_DIST = PET_LEASH_DIST * 1.35;

    // --- Target selection — sticky, pet-relative range, no player-distance filter ---
    let target=null;
    if(mob.petTargetId!=null){
      const prev=mobs.find(m=>m.id===mob.petTargetId&&!m.dead);
      if(prev&&Math.hypot(prev.x-mob.x,prev.y-mob.y)<=PET_DEAGGRO_RANGE) target=prev;
    }
    if(!target){
      // Aggro anything inside or slightly outside the leash ring (player-relative),
      // so the pet defends its territory rather than a fixed pet-relative range.
      const PET_AGGRO_RING = PET_LEASH_DIST + 120;
      let bestDist=Infinity;
      for(const other of mobs){
        if(other.dead||other.id===mob.id) continue;
        if(other.isFriendlyPet) continue;
        if(other.typeId==='digger'||other.typeId==='beekeeper') continue;
        if(other.typeId==='ant_egg') continue;
        // beehive and ant_hole are valid targets for pets
        const distFromPlayer=Math.hypot(other.x-playerX,other.y-playerY);
        if(distFromPlayer>PET_AGGRO_RING) continue;
        const td=Math.hypot(other.x-mob.x,other.y-mob.y);
        if(td<bestDist){bestDist=td;target=other;}
      }
      mob.petTargetId=target?target.id:null;
    }

    const isChasing = target != null;
    // Hard leash: chasing pets get a grace zone; idle pets get a small soft buffer so
    // random wander steps just past the ring don't cause jitter.
    const PET_LEASH_SOFT_IDLE = PET_LEASH_DIST + 80;
    const leashLimit = isChasing ? PET_LEASH_GRACE_DIST : PET_LEASH_SOFT_IDLE;

    if(pdist > leashLimit){
      // Return toward ring edge — drop any target, no combat during return
      if(isChasing){ mob.petTargetId=null; mob.alerted=false; }
      const dx=playerX-mob.x,dy=playerY-mob.y;
      mob.targetFacing=Math.atan2(dy,dx);
      const overleash=Math.min((pdist-leashLimit)/300,1);
      mob.speed=mob.baseSpeed+(mob.alertSpeed-mob.baseSpeed)*overleash;
      // Stop at the ring edge, not at the player
      const excess=pdist-PET_LEASH_DIST;
      const step=Math.min(mob.speed,excess);
      const nx=mob.x+(dx/pdist)*step,ny=mob.y+(dy/pdist)*step;
      if(canMoveTo(nx,ny,mob.radius)){mob.x=nx;mob.y=ny;}
      let lfd=mob.targetFacing-mob.facing;
      if(lfd>Math.PI) lfd-=Math.PI*2; if(lfd<-Math.PI) lfd+=Math.PI*2;
      mob.facing+=lfd*0.08;
      const rspd=Math.hypot(mob.x-(mob.lastX||mob.x),mob.y-(mob.lastY||mob.y));
      if(rspd>0.05){const sf=Math.min(4.0,rspd/mob.baseSpeed*2.5);mob.pincerPhase=(mob.pincerPhase||0)+0.18*sf;mob.wingPhase=(mob.wingPhase||0)+0.14*sf;}
      mob.lastX=mob.x;mob.lastY=mob.y;
      continue;
    }

    if(target){
      // Chase target
      const dx=target.x-mob.x,dy=target.y-mob.y,dist=Math.hypot(dx,dy);
      mob.alerted=true;
      mob.speed=mob.alertSpeed;
      mob.targetFacing=Math.atan2(dy,dx);
      if(dist>mob.radius+target.radius&&dist>0.001){
        const nx=mob.x+(dx/dist)*mob.speed,ny=mob.y+(dy/dist)*mob.speed;
        if(canMoveTo(nx,ny,mob.radius)){mob.x=nx;mob.y=ny;}
      }
    } else {
      // Idle — wander freely near player, never explicitly face the player
      mob.alerted=false;
      mob.petTargetId=null;
      if(pdist>PET_LEASH_DIST){
        // Outside leash ring — drift back to the ring edge, not all the way to player
        const excess=pdist-PET_LEASH_DIST;
        const followT=Math.min(excess/300,1);
        mob.speed=mob.baseSpeed*(0.35+0.4*followT);
        const dx=playerX-mob.x,dy=playerY-mob.y;
        // Blend wander angle toward player direction proportionally — soft pull, no snap
        const toPlayerAngle=Math.atan2(dy,dx);
        let aDiff=toPlayerAngle-mob.wanderAngle;
        if(aDiff>Math.PI) aDiff-=Math.PI*2; if(aDiff<-Math.PI) aDiff+=Math.PI*2;
        mob.wanderAngle+=aDiff*(0.08+0.12*followT);
        mob.targetFacing=mob.wanderAngle;
        // Cap step so the pet stops at the ring edge, not at the player
        const step=Math.min(mob.speed,excess);
        const nx=mob.x+Math.cos(mob.wanderAngle)*step,ny=mob.y+Math.sin(mob.wanderAngle)*step;
        if(canMoveTo(nx,ny,mob.radius)){mob.x=nx;mob.y=ny;}
        else{mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=400+Math.random()*600;}
      } else {
        // Fully idle: slow random wander, no player direction bias at all
        mob.speed=mob.baseSpeed;
        mob.wanderTimer-=dt;
        if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
        mob.targetFacing=mob.wanderAngle;
        const nx=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
        const ny=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
        if(canMoveTo(nx,ny,mob.radius)){mob.x=nx;mob.y=ny;}
        else{mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=400+Math.random()*600;}
      }
    }

    // Facing + leg/wing animation
    let facingDiff=mob.targetFacing-mob.facing;
    if(facingDiff>Math.PI) facingDiff-=Math.PI*2; if(facingDiff<-Math.PI) facingDiff+=Math.PI*2;
    mob.facing+=facingDiff*0.08;
    const spd=Math.hypot(mob.x-(mob.lastX||mob.x),mob.y-(mob.lastY||mob.y));
    if(spd>0.05){const sf=Math.min(4.0,spd/mob.baseSpeed*2.5);mob.pincerPhase=(mob.pincerPhase||0)+0.18*sf;mob.wingPhase=(mob.wingPhase||0)+0.14*sf;}
    mob.lastX=mob.x;mob.lastY=mob.y;
  }

  // ── Digger pet animation update — runs after pet AI loop gives movement data ──
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='digger'||!mob.isFriendlyPet) continue;

    const target = mob.petTargetId != null ? mobs.find(m=>m.id===mob.petTargetId&&!m.dead) : null;
    if(target){
      const tdx=target.x-mob.x, tdy=target.y-mob.y;
      const td=Math.hypot(tdx,tdy);
      if(td>0.01){ mob.eyeAngle=Math.atan2(tdy,tdx); }
    } else {
      mob.eyeAngle=mob.facing ?? mob.wanderAngle ?? 0;
    }

    const moveX=Math.cos(mob.eyeAngle), moveY=Math.sin(mob.eyeAngle);
    const targetPdx=moveX*mob.drawRadius*0.09, targetPdy=moveY*mob.drawRadius*0.09;
    mob.animPdx=(mob.animPdx??0)*0.85+targetPdx*0.15;
    mob.animPdy=(mob.animPdy??0)*0.85+targetPdy*0.15;

    const hpPct=mob.hp/mob.maxHp;
    if(hpPct<0.3){ mob.state='sad'; }
    else if(target){ mob.state='angry'; }
    else { mob.state='neutral'; }

    const targetBrowT=mob.state==='angry'?1:0;
    mob.browT=(mob.browT??0)*0.88+targetBrowT*0.12;

    const dr=mob.drawRadius;
    const targetCpOffset=mob.state==='angry'?-dr*0.20:mob.state==='sad'?-dr*0.13:dr*0.14;
    mob.animCpOffset=(mob.animCpOffset??dr*0.14)*0.85+targetCpOffset*0.15;

    mob.cutterRot=(mob.cutterRot??0)+(target?0.08:0.03);
  }

  // Queen ant — aggros at range + stops every ~5 s to lay an egg
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='queen_ant') continue;
    let targetX=playerX,targetY=playerY;
    let tDist2q=Math.hypot(playerX-mob.x,playerY-mob.y);
    for(const dg of diggers){const dd=Math.hypot(dg.x-mob.x,dg.y-mob.y);if(dd<tDist2q){targetX=dg.x;targetY=dg.y;tDist2q=dd;}}
    const dx=targetX-mob.x,dy=targetY-mob.y,dist=Math.hypot(dx,dy);
    if(dist>AI_CULL_DIST) continue;
    if(mob.alerted&&dist>DEAGGRO_DIST){mob.alerted=false;mob.wanderAngle=mob.facing;mob.wanderTimer=800;}

    if(mob.queenLayState==='pausing'){
      mob.queenLayPause-=dt;
      if(mob.queenLayPause<=0){
        const egg=spawnMob('ant_egg',mob.x,mob.y,mob.homeZoneId,mob.tier);
        egg.isZoneTracked=false;
        // Egg inherits queen's home so hatched soldier knows where the colony is
        egg.homeX=mob.homeX??mob.x; egg.homeY=mob.homeY??mob.y;
        mob.queenLayState='moving';
        mob.queenLayTimer=5000;
      }
      mob.targetFacing=mob.facing;
      continue;
    }

    mob.queenLayTimer-=dt;
    if(mob.queenLayTimer<=0&&!mob.alerted){
      mob.queenLayState='pausing'; mob.queenLayPause=500; continue;
    }

    let chasing=false;
    if(mob.aggroRange>0&&dist<mob.aggroRange&&dist>0.01){chasing=true;mob.alerted=true;mob.speed=mob.alertSpeed||mob.baseSpeed;}
    else if(mob.alerted){chasing=true;mob.speed=mob.alertSpeed||mob.baseSpeed;}
    else mob.speed=mob.baseSpeed;
    
    // Apply web slowdown
    const slowFactorQA = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactorQA);
    
    mob.targetFacing=chasing?Math.atan2(dy,dx):mob.wanderAngle;
    let nqX=mob.x,nqY=mob.y;
    if(chasing&&dist>0.01){nqX=mob.x+(dx/dist)*mob.speed;nqY=mob.y+(dy/dist)*mob.speed;}
    else{
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=1200+Math.random()*2500;}
      if(mob.homeX!==undefined){
        const hdx=mob.homeX-mob.x,hdy=mob.homeY-mob.y;
        if(Math.hypot(hdx,hdy)>getAntHomeRadius(mob.tier)){mob.wanderAngle=Math.atan2(hdy,hdx);mob.wanderTimer=600;}
      }
      nqX=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      nqY=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
    }
    if(canMoveTo(nqX,nqY,mob.radius)){mob.x=nqX;mob.y=nqY;}
    else{mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderTimer=400+Math.random()*600;}
  }

  // ── Hornet AI ─────────────────────────────────────────────────────────────
  const HORNET_AIM_HOLD_MS    = 120;    // brief hold at fully-aimed before firing
  const HORNET_REGROW_MS      = 900;    // stinger regrow duration
  const MISSILE_SPEED         = 20;    // px/frame at 60fps
  const MISSILE_LIFETIME      = 3800;   // ms
  const TURN_RATE             = 0.08;  // radians per frame — smooth rotation

  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='hornet') continue;
    const hornetPreferredDist = (mob.drawRadius ?? 22) * 11;  // always ~11 body-radii away, scales with rarity
    // Hornets target nearest enemy: player, digger, or beekeeper
    let targetX = playerX, targetY = playerY;
    let dist = Math.hypot(playerX-mob.x, playerY-mob.y);
    for(const dg of diggers){const dd=Math.hypot(dg.x-mob.x,dg.y-mob.y); if(dd<dist){targetX=dg.x;targetY=dg.y;dist=dd;} }
    const dx = targetX-mob.x;
    const dy = targetY-mob.y;
    if(dist>AI_CULL_DIST) continue;

    // De-aggro
    if(mob.alerted && dist>DEAGGRO_DIST){
      mob.alerted=false; mob.shootState='idle';
      mob.stingerProgress=1; mob.wanderAngle=mob.facing; mob.wanderTimer=800;
    }
    // Aggro check
    if(!mob.alerted && dist<mob.aggroRange){
      mob.alerted=true; mob.shootState='approach'; mob.shootTimer=0; mob.stingerProgress=1;
    }

    // Apply web slowdown
    const slowFactorH = getWebSlowdownFactor(mob.x, mob.y);
    mob.speed *= (1 - slowFactorH);

    if(!mob.alerted){
      // Wander
      mob.wanderTimer-=dt;
      if(mob.wanderTimer<=0){ mob.wanderAngle=Math.random()*Math.PI*2; mob.wanderTimer=1200+Math.random()*2500; }
      const nx=mob.x+Math.cos(mob.wanderAngle)*mob.speed*0.45;
      const ny=mob.y+Math.sin(mob.wanderAngle)*mob.speed*0.45;
      if(canMoveTo(nx,ny,mob.radius)){mob.x=nx;mob.y=ny;}
      let fd=mob.wanderAngle-mob.facing;
      if(fd>Math.PI)fd-=Math.PI*2; if(fd<-Math.PI)fd+=Math.PI*2;
      mob.facing+=Math.sign(fd)*Math.min(Math.abs(fd),TURN_RATE);
      mob.wobblePhase=(mob.wobblePhase||0)+0.12;
      continue;
    }

    const angleToTarget=Math.atan2(dy,dx);
    // Stinger toward target → antenna points AWAY → facing = angleToTarget + PI
    const aimFacing=angleToTarget+Math.PI;

    // Helper: fixed-rate rotation toward a target angle, returns remaining error
    function rotateTo(target) {
      let fd=target-mob.facing;
      if(fd>Math.PI)fd-=Math.PI*2; if(fd<-Math.PI)fd+=Math.PI*2;
      mob.facing+=Math.sign(fd)*Math.min(Math.abs(fd),TURN_RATE);
      return Math.abs(fd);
    }

    switch(mob.shootState){
      case 'approach': {
        // Move to preferred distance — never retreat
        if(dist>hornetPreferredDist+40){
          const nx=mob.x+(dx/dist)*mob.speed;
          const ny=mob.y+(dy/dist)*mob.speed;
          if(canMoveTo(nx,ny,mob.radius)){mob.x=nx;mob.y=ny;}
        }
        rotateTo(angleToTarget); // antenna toward target while approaching
        mob.wobblePhase=(mob.wobblePhase||0)+0.12;
        if(dist<=hornetPreferredDist+40){ mob.shootState='aim'; mob.shootTimer=0; }
        break;
      }
      case 'aim': {
        // Rotate stinger to face player — stop moving entirely
        const err=rotateTo(aimFacing);
        mob.wobblePhase=(mob.wobblePhase||0)+0.06;
        // Only count hold time when fully aimed; reset timer if still turning
        if(err<0.03){
          mob.shootTimer+=dt;
          if(mob.shootTimer>=HORNET_AIM_HOLD_MS){ mob.shootState='fire'; mob.shootTimer=0; }
        } else {
          mob.shootTimer=0; // keep waiting until truly aimed
        }
        break;
      }
      case 'fire': {
        // Spawn missile from stinger tip (updated proportions: ry=1.35, stinger ext=0.90)
        const dr=mob.drawRadius??mob.radius;
        const stingerTipDist=dr*(1.35+0.90); // = 2.25 * drawRadius
        const fireAngle=mob.facing+Math.PI;           // tip points at player
        const sx=mob.x+Math.cos(fireAngle)*stingerTipDist;
        const sy=mob.y+Math.sin(fireAngle)*stingerTipDist;
        const t=mob.tier??0;
        const hs=MOB_STATS.hornet;
        const mScale=RADIUS_SCALE[t]??1;
        missiles.push({
          x:sx, y:sy,
          vx:Math.cos(fireAngle)*MISSILE_SPEED,
          vy:Math.sin(fireAngle)*MISSILE_SPEED,
          hp:hs.missileHp[t], maxHp:hs.missileHp[t],
          damage:hs.missileDmg[t],
          armor:hs.armor[t],
          // Match visual stinger proportions: width = mobR * 0.38 (use drawRadius for exact match)
          radius: Math.max(4, Math.round((mob.drawRadius ?? mob.radius) * 0.38)),
          stingerR:mob.drawRadius??mob.radius,                 // visual scale = match hornet stinger exactly
          fromMobId:mob.id,
          rarity:mob.rarity,
          tier:t,
          lifetime:MISSILE_LIFETIME,
          dead:false,
          angle:fireAngle,
        });
        mob.stingerProgress=0;
        mob.shootState='reset';
        mob.shootTimer=0;
        break;
      }
      case 'reset': {
        // Rotate back to normal facing (antenna toward target) while regrowing stinger
        const err=rotateTo(angleToTarget);
        mob.shootTimer+=dt;
        mob.stingerProgress=Math.min(1, mob.shootTimer/HORNET_REGROW_MS);
        mob.wobblePhase=(mob.wobblePhase||0)+0.05;
        // Must BOTH fully rotate back AND fully regrow before firing again
        if(mob.stingerProgress>=1 && err<0.04){
          mob.shootState=(dist>hornetPreferredDist+80)?'approach':'aim';
          mob.shootTimer=0;
        }
        break;
      }
      default: mob.shootState='approach';
    }
  }

  // ── Missile updates ───────────────────────────────────────────────────────
  for(let i=missiles.length-1;i>=0;i--){
    const m=missiles[i];
    if(m.dead){missiles.splice(i,1);continue;}
    m.x+=m.vx; m.y+=m.vy;
    m.lifetime-=dt;
    if(m.lifetime<=0||m.hp<=0){missiles.splice(i,1);}
  }

  // ── Mob-mob pushing ──────────────────────────────────────────────────────
  // CELL=6000: at Runic the largest collision radius is ~2100 (spider).
  // Two Runic spiders touching = ~4200 gap. 3×3 neighbor search covers ±12000,
  // so every possible overlapping pair is found in a single neighbor hop.
  // Grid is rebuilt each iteration so mobs that crossed cell boundaries are found.
  //
  // Wall-pinning fix: when one mob is blocked by a wall it can't absorb its share
  // of the overlap, so the free mob now absorbs the FULL overlap instead of just
  // its proportional share. This makes crowds properly push things against walls
  // rather than phasing through them.
  const CELL=6000;
  for(let iter=0;iter<10;iter++){
    const grid=new Map();
    for(const mob of mobs){
      if(mob.dead) continue;
      const cx=Math.floor(mob.x/CELL), cy=Math.floor(mob.y/CELL), key=cx*100000+cy;
      if(!grid.has(key)) grid.set(key,[]);
      grid.get(key).push(mob);
    }
    for(const [key,cell] of grid){
      const cx=Math.floor(key/100000), cy=key%100000;
      const neighbours=[cell];
      for(let ox=-1;ox<=1;ox++) for(let oy=-1;oy<=1;oy++){
        if(ox===0&&oy===0) continue;
        const n=grid.get((cx+ox)*100000+(cy+oy)); if(n) neighbours.push(n);
      }
      for(let ni=0;ni<neighbours.length;ni++){
        const other=neighbours[ni];
        for(let i=0;i<cell.length;i++){
          const a=cell[i];
          for(let j=(ni===0?i+1:0);j<other.length;j++){
            const b=other[j];
            if(a===b||a.dead||b.dead) continue;
            // ant_hole and beehive have no mob-mob collision — EXCEPT friendly pets do collide with them
            const aIsStructure = a.typeId==='ant_hole'||a.typeId==='beehive';
            const bIsStructure = b.typeId==='ant_hole'||b.typeId==='beehive';
            if((aIsStructure||bIsStructure)&&!(a.isFriendlyPet||b.isFriendlyPet)) continue;
            if(a.typeId==='ant_egg'||b.typeId==='ant_egg') continue;
            const sameChain=a.chainId!=null&&a.chainId===b.chainId;
            const dx=b.x-a.x, dy=b.y-a.y, dist=Math.hypot(dx,dy), minD=a.radius+b.radius;
            if(dist>=minD||dist<0.001) continue;
            if(sameChain){
              const idxDiff=Math.abs((a.segIndex??0)-(b.segIndex??0));
              if(idxDiff<=1) continue; // adjacent — follow logic handles spacing
            }
            const nx=dx/dist, ny=dy/dist, overlap=minD-dist, total=a.mass+b.mass;
            const ax=a.x-nx*overlap*(b.mass/total), ay=a.y-ny*overlap*(b.mass/total);
            const bx=b.x+nx*overlap*(a.mass/total), by=b.y+ny*overlap*(a.mass/total);
            const aCanMove=canMoveTo(ax,ay,a.radius);
            const bCanMove=canMoveTo(bx,by,b.radius);
            if(aCanMove&&bCanMove){
              a.x=ax;a.y=ay;b.x=bx;b.y=by;
            } else if(aCanMove&&!bCanMove){
              // b is wall-blocked — push a the full overlap so nothing is lost
              const ax2=a.x-nx*overlap, ay2=a.y-ny*overlap;
              if(canMoveTo(ax2,ay2,a.radius)){a.x=ax2;a.y=ay2;}
              else{a.x=ax;a.y=ay;} // wall on both sides, take a's share at minimum
            } else if(!aCanMove&&bCanMove){
              // a is wall-blocked — push b the full overlap so nothing is lost
              const bx2=b.x+nx*overlap, by2=b.y+ny*overlap;
              if(canMoveTo(bx2,by2,b.radius)){b.x=bx2;b.y=by2;}
              else{b.x=bx;b.y=by;} // wall on both sides, take b's share at minimum
            }
            // both wall-blocked: nothing to be done
          }
        }
      }
    }
  }

  // ── Facing & animation for regular mobs ───────────────────────────────────
  for(const mob of mobs){
    if(mob.dead||mob.isCentipede||mob.typeId==='hornet') continue;
    if(mob.typeId==='ant_hole'||mob.typeId==='ant_egg'||mob.typeId==='beehive') continue;
    let diff=mob.targetFacing-mob.facing;
    if(diff>Math.PI) diff-=Math.PI*2; if(diff<-Math.PI) diff+=Math.PI*2;
    if(mob.typeId==='spider'){
      mob.facing+=diff*0.08;
      const spd=Math.hypot(mob.x-(mob.lastX||mob.x),mob.y-(mob.lastY||mob.y));
      if(spd>0.05) mob.legPhase+=0.07;
    } else if(mob.typeId==='bee'||mob.typeId==='queen_bee'){
      // Face the direction of actual movement with smooth rotation
      const dx = mob.x - (mob.lastX || mob.x);
      const dy = mob.y - (mob.lastY || mob.y);
      let targetFacing = mob.targetFacing; // default to target if not moving
      if(Math.hypot(dx, dy) > 0.05) {
        targetFacing = Math.atan2(dy, dx); // movement direction
      }
      // Smooth rotation toward target facing
      let diff2 = targetFacing - mob.facing;
      if(diff2 > Math.PI) diff2 -= Math.PI*2; if(diff2 < -Math.PI) diff2 += Math.PI*2;
      mob.facing += diff2 * 0.08;
      mob.wobblePhase = (mob.wobblePhase || 0) + 0.065;
      // Sway ±15 degrees left/right (0.26 radians)
      const swayAmp = 0.26;
      mob.swayHitX = Math.sin(mob.wobblePhase) * swayAmp * (mob.drawRadius || mob.radius) * 0.55;
    } else if(mob.isAntMob){
      mob.facing+=diff*0.08;
      const spd=Math.hypot(mob.x-(mob.lastX||mob.x),mob.y-(mob.lastY||mob.y));
      if(spd>0.05){
        // Scale animation speed with movement: faster movement = faster mandible chatter & wing flap
        const speedFactor=Math.min(4.0, spd/mob.baseSpeed * 2.5);
        mob.pincerPhase=(mob.pincerPhase||0)+0.18*speedFactor;
        mob.wingPhase  =(mob.wingPhase  ||0)+0.14*speedFactor;
      }
    } else {
      mob.facing+=diff*0.07;
    }
    mob.lastX=mob.x; mob.lastY=mob.y;
  }

  // ── Ant egg hatching ──────────────────────────────────────────────────────
  // After 3.5s, each egg dies and spawns a soldier ant of the same tier.
  for(const mob of mobs){
    if(mob.dead||mob.typeId!=='ant_egg') continue;
    mob.eggHatchTimer=(mob.eggHatchTimer??3500)-dt;
    if(mob.eggHatchTimer<=0){
      const soldier=spawnAntMinion('soldier_ant',mob.x,mob.y,mob.homeX??mob.x,mob.homeY??mob.y,mob.homeZoneId,mob.tier);
      mob.dead=true;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  for(let i=mobs.length-1;i>=0;i--){
    if(mobs[i].dead){ onMobDied(mobs[i]); mobs.splice(i,1); }
  }

  updateZoneSpawning(dt,playerX,playerY);
}
// ============================================================================
// MOTORE DI SIMULAZIONE - Paladino della Vendetta (Firbolg) vs Chierico della Tomba (Halfling)
// D&D 5e, livello 8 di default. Tutto e' configurabile dall'oggetto cfg.
// ============================================================================
'use strict';

// ---------- numeri casuali ----------
let R = Math.random;
function seedRng(seed) {
  if (seed === null || seed === undefined || seed === '' || isNaN(Number(seed))) { R = Math.random; return; }
  let a = (Number(seed) >>> 0) || 1;
  R = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const d = (n, s) => { let t = 0; for (let i = 0; i < n; i++) t += 1 + Math.floor(R() * s); return t; };
const d20raw = () => 1 + Math.floor(R() * 20);
// d20 con eventuale Fortunato (Halfling: ritira i 1 naturali) e vantaggio/svantaggio
function d20(lucky, mode) {
  const one = () => { let r = d20raw(); if (lucky && r === 1) r = d20raw(); return r; };
  if (mode === 1) return Math.max(one(), one());
  if (mode === -1) return Math.min(one(), one());
  return one();
}

// ---------- configurazione di default ----------
// Arma: n dadi da "die" facce, ench = bonus magico a colpire e ai danni,
// extras = danni aggiuntivi { label, n, die, bonus, trigger: hit | crit | turn | first }
function defaults() {
  return {
    dist: 30, maxRounds: 30,
    pal: {
      // Livello 8. Firbolg: FOR 15+1, SAG 10+2. ASI al 4 e all'8 in FOR (20). Competenza TS: SAG e CAR.
      // Aura di Protezione (liv. 6): aggiunge il mod. di Carisma a tutti i tiri salvezza.
      hp: 68, ac: 18, prof: 3, strMod: 5, dexMod: -1, conMod: 2, wisMod: 1, chaMod: 1, aura: true,
      style: 'duel', speed: 30, slot1: 4, slot2: 3, loh: 40, lohThr: 35, cd: 1, hiddenUses: 3,
      melee: { n: 1, die: 8, ench: 0, extras: [] },
      ranged: { n: 1, die: 6, abil: 'str', normal: 30, long: 120, ench: 0, extras: [] },
      // strategia
      smite: 'smart', smiteReserve: 0, smiteHpThr: 100, rangedRounds: 0,
      vow: true, hidden: true, misty: true, actionSpell: 'none', bonusSpell: 'none'
    },
    cle: {
      // Livello 8. Halfling (Piedelesto): DES+2, CAR+1. Tomba. ASI al 4 e all'8 in SAG (20). Competenza TS: SAG e CAR.
      // Sentinella alle Porte della Morte (liv. 6): trasforma un critico subito in un colpo normale, SAG volte.
      // Incantesimi Potenziati (liv. 8): aggiunge il mod. di SAG ai danni dei trucchetti.
      hp: 59, ac: 18, prof: 3, wisMod: 5, dexMod: 2, conMod: 2, chaMod: 0, strMod: -1,
      speed: 25, slot1: 4, slot2: 3, slot3: 3, slot4: 2, healThr: 30, lucky: true, path: true, cd: 2,
      sentinel: 5, potent: true, blight: true,
      opening: 'sg', noSlot: 'flame',
      weapon: { n: 1, die: 6, ench: 0, extras: [] }
    }
  };
}

// ---------- un duello ----------
function duel(cfg, log) {
  const pc = cfg.pal, cc = cfg.cle;
  const pal = {
    hp: pc.hp, max: pc.hp, s1: pc.slot1, s2: pc.slot2, loh: pc.loh, cd: pc.cd, hid: pc.hiddenUses,
    conc: null, para: false, vow: false, inv: false, brand: false, mark: false, acB: 0,
    round: 0, rangedLast: false, paraRounds: 0, openDone: false, vowUsed: false, turnHit: false, firstHit: false
  };
  const cle = {
    hp: cc.hp, max: cc.hp, s1: cc.slot1, s2: cc.slot2, s3: cc.slot3, s4: cc.slot4 | 0, cd: cc.cd, sd: cc.sentinel | 0,
    conc: null, para: false, sw: 0, cursed: false, curseTurn: 0, turn: 0, holdTries: 0, turnHit: false, firstHit: false
  };
  let dist = cfg.dist;
  const dmgP = {}, dmgC = {};
  const add = (o, l, n) => { if (n > 0) o[l] = (o[l] || 0) + n; };
  const say = log ? (m) => log(m) : null;

  const MW = pc.melee, RW = pc.ranged, CW = cc.weapon;
  const palAC = () => pc.ac + (pc.style === 'def' ? 1 : 0) + pal.acB;
  const palAtk = pc.strMod + pc.prof + (MW.ench | 0);
  const palDmgB = pc.strMod + (pc.style === 'duel' ? 2 : 0) + (MW.ench | 0);
  const rMod = RW.abil === 'dex' ? pc.dexMod : pc.strMod;
  const rAtk = rMod + pc.prof + (RW.ench | 0), rBon = rMod + (RW.ench | 0);
  const aura = pc.aura ? Math.max(1, pc.chaMod) : 0;
  const palSv = { dex: pc.dexMod + aura, con: pc.conMod + aura, wis: pc.wisMod + pc.prof + aura, cha: pc.chaMod + pc.prof + aura };
  const cleSv = { dex: cc.dexMod, con: cc.conMod, wis: cc.wisMod + cc.prof, cha: cc.chaMod + cc.prof };
  const palDC = 8 + pc.prof + pc.chaMod, cleDC = 8 + cc.prof + cc.wisMod, cleAtk = cc.prof + cc.wisMod;
  const cleWAtk = cc.strMod + cc.prof + (CW.ench | 0), cleWBon = cc.strMod + (CW.ench | 0);

  const palBless = () => pal.conc === 'bless';
  const palBane = () => cle.conc === 'bane';
  const cleBless = () => cle.conc === 'bless';
  const cleBane = () => pal.conc === 'bane';

  function saveP(bonus, dc, autoFail) {
    if (autoFail) return false;
    const t = d20raw() + bonus + (palBless() ? d(1, 4) : 0) - (palBane() ? d(1, 4) : 0);
    return t >= dc;
  }
  function saveC(bonus, dc, autoFail) {
    if (autoFail) return false;
    const t = d20(cc.lucky, 0) + bonus + (cleBless() ? d(1, 4) : 0) - (cleBane() ? d(1, 4) : 0);
    return t >= dc;
  }
  function atkRoll(bonus, ac, adv, dis, lucky, bless, bane) {
    const mode = adv && !dis ? 1 : (dis && !adv ? -1 : 0);
    const r = lucky ? d20(true, mode) : d20(false, mode);
    if (r === 1) return { hit: false, crit: false };
    const tot = r + bonus + (bless ? d(1, 4) : 0) - (bane ? d(1, 4) : 0);
    const crit = r === 20;
    return { hit: crit || tot >= ac, crit };
  }

  // danni aggiuntivi dell'arma (fuoco, freddo, ecc.)
  function weaponExtras(w, crit, st, dmgLog, parts) {
    let tot = 0;
    for (const e of (w.extras || [])) {
      const n = Math.max(0, e.n | 0), faces = Math.max(1, e.die | 0), bonus = e.bonus | 0;
      let apply = false, dbl = true;
      if (e.trigger === 'crit') { apply = crit; dbl = false; }
      else if (e.trigger === 'turn') apply = !st.turnHit;
      else if (e.trigger === 'first') apply = !st.firstHit;
      else apply = true;
      if (!apply) continue;
      const x = (n > 0 ? d(n * (crit && dbl ? 2 : 1), faces) : 0) + bonus;
      if (x <= 0) continue;
      add(dmgLog, e.label || 'Danno extra', x);
      tot += x; if (parts) parts.push((e.label || 'extra') + ' ' + x);
    }
    st.turnHit = true; st.firstHit = true;
    return tot;
  }

  function dropPalConc() {
    if (pal.conc === 'hold') cle.para = false;
    if (pal.conc === 'sof') pal.acB = 0;
    pal.conc = null; pal.mark = false; pal.brand = false;
  }
  function dropCleConc() {
    if (cle.conc === 'hold') pal.para = false;
    cle.conc = null;
  }
  function hurtPal(n, label) {
    if (n <= 0) return;
    pal.hp -= n; if (label) add(dmgC, label, n);
    if (pal.hp > 0 && pal.conc) {
      if (!saveP(palSv.con, Math.max(10, Math.floor(n / 2)), false)) {
        if (say) say('   Il paladino perde la concentrazione.');
        dropPalConc();
      }
    }
  }
  function hurtCle(n) {
    if (n <= 0) return;
    cle.hp -= n;
    if (cle.hp > 0 && cle.conc) {
      if (!saveC(cleSv.con, Math.max(10, Math.floor(n / 2)), false)) {
        if (say) say('   Il chierico perde la concentrazione.');
        dropCleConc();
      }
    }
  }
  function sg(quando) {
    let dmg = d(3, 8);
    const ok = saveP(palSv.wis, cleDC, false);
    if (ok) dmg = Math.floor(dmg / 2);
    hurtPal(dmg, 'Spirito Guardiano');
    if (say) say(`   Spirito Guardiano (${quando}): ${dmg} danni (TS ${ok ? 'riuscito' : 'fallito'}).`);
  }

  // Scelta dello slot di Punizione Divina. "tot" = danni gia' inflitti con questo colpo.
  function smiteSlot(crit, tot) {
    if (pc.smite === 'never') return 0;
    if (cle.hp > cle.max * (pc.smiteHpThr === undefined ? 100 : pc.smiteHpThr) / 100) return 0;
    if (pal.s1 + pal.s2 <= (pc.smiteReserve | 0)) return 0;
    const lv = [];
    if (pal.s1 > 0) lv.push(1);
    if (pal.s2 > 0) lv.push(2);
    if (!lv.length) return 0;
    const lo = Math.min.apply(null, lv), hi = Math.max.apply(null, lv);
    switch (pc.smite) {
      case 'always': return lo;
      case 'always_high': return hi;
      case 'crit': return crit ? hi : 0;
      case 'lvl1': return pal.s1 > 0 ? 1 : 0;
      case 'lvl2': return pal.s2 > 0 ? 2 : 0;
      case 'smart': {
        // critico: slot piu' alto. Altrimenti slot 1 sui colpi normali; lo slot 2 solo se il colpo e' letale.
        if (crit) return hi;
        const lethal = lv.filter((l) => tot + (1 + l) * 4.5 >= cle.hp);
        if (lethal.length) return Math.min.apply(null, lethal);
        return pal.s1 > 0 ? 1 : 0;
      }
      default: return 0;
    }
  }

  // --------------------------------------------------------------- PALADINO
  function palTurn() {
    const start = dist;
    if (cle.conc === 'sg' && dist <= 15) { sg('inizio turno'); if (pal.hp <= 0) return; }
    if (pal.para) {
      pal.paraRounds++;
      if (say) say('   Il paladino e\' paralizzato: perde il turno.');
      if (saveP(palSv.wis, cleDC, false)) {
        pal.para = false; cle.conc = null;
        if (say) say('   Il paladino si libera da Blocca Persona.');
      }
      return;
    }
    if (pal.hp <= pal.max * pc.lohThr / 100 && pal.loh > 0) {
      const h = Math.min(pal.loh, pal.max - pal.hp);
      pal.hp += h; pal.loh -= h;
      if (say) say(`   Imposizione delle Mani: +${h} PF (PF ${pal.hp}).`);
      return;
    }
    pal.round++; pal.turnHit = false;
    let action = true, bonus = true, dashed = false;

    // Incantesimo d'apertura con l'azione (una volta per duello)
    if (pc.actionSpell !== 'none' && !pal.openDone && !pal.conc && dist <= 60 && !cle.para) {
      const sp = pc.actionSpell, lv = sp === 'hold' ? 2 : 1;
      if ((lv === 2 ? pal.s2 : pal.s1) > 0) {
        if (lv === 2) pal.s2--; else pal.s1--;
        action = false; pal.openDone = true;
        if (sp === 'hold') {
          if (!saveC(cleSv.wis, palDC, false)) {
            cle.para = true; dropCleConc(); pal.conc = 'hold';
            if (say) say('   Blocca Persona: il chierico e\' PARALIZZATO.');
          } else if (say) say('   Blocca Persona: il chierico resiste.');
        } else if (sp === 'bane') {
          if (!saveC(cleSv.cha, palDC, false)) {
            pal.conc = 'bane'; if (say) say('   Anatema: il chierico e\' maledetto.');
          } else if (say) say('   Anatema: il chierico resiste.');
        } else if (sp === 'bless') {
          pal.conc = 'bless'; if (say) say('   Benedizione sul paladino.');
        }
      }
    }

    // Avvicinamento
    const rangedPhase = pal.round <= pc.rangedRounds && dist > 5;
    pal.rangedLast = false;
    let attackType = null;
    if (rangedPhase && dist <= RW.long) {
      attackType = 'ranged'; pal.rangedLast = true;
    } else {
      let need = dist - 5;
      if (need > 0) {
        const sp = pc.speed;
        if (need > sp && pc.misty && bonus && pal.s2 > 0 && need <= sp + 30) {
          pal.s2--; bonus = false; dist -= 30; need = dist - 5;
          if (say) say('   Passo Velato: si teletrasporta di 30 ft.');
        }
        dist -= Math.min(sp, need); need = dist - 5;
        if (need > 0 && action) {
          action = false; dashed = true;
          dist -= Math.min(sp, need); need = dist - 5;
          if (say) say('   Scatto verso il chierico.');
        }
        if (cle.conc === 'sg' && start > 15 && dist <= 15) { sg('ingresso nell\'area'); if (pal.hp <= 0) return; }
      }
      if (dist <= 5 && action) attackType = 'melee';
    }

    // Azioni bonus
    if (bonus && pc.vow && pal.cd > 0 && !pal.vow && dist <= 10) {
      pal.cd--; pal.vow = true; pal.vowUsed = true; bonus = false;
      if (say) say('   Voto di Inimicizia: vantaggio su tutti gli attacchi contro il chierico.');
    }
    if (bonus && pc.hidden && pal.hid > 0 && !pal.inv && !pal.vow && (dashed || attackType)) {
      pal.hid--; pal.inv = true; bonus = false;
      if (say) say('   Passo Nascosto: il paladino diventa invisibile.');
    }
    if (bonus && pc.bonusSpell !== 'none' && !pal.conc) {
      const lv = pc.bonusSpell === 'branding' ? 2 : 1;
      if ((lv === 2 ? pal.s2 : pal.s1) > 0) {
        if (lv === 2) pal.s2--; else pal.s1--;
        bonus = false;
        if (pc.bonusSpell === 'hm') { pal.conc = 'hm'; pal.mark = true; if (say) say('   Marchio del Cacciatore sul chierico.'); }
        if (pc.bonusSpell === 'branding') { pal.conc = 'branding'; pal.brand = true; if (say) say('   Marchio Infuocante preparato.'); }
        if (pc.bonusSpell === 'sof') { pal.conc = 'sof'; pal.acB = 2; if (say) say('   Scudo della Fede: CA +2.'); }
      }
    }

    // Attacchi (Attacco Extra)
    if (action && attackType) {
      const melee = attackType === 'melee';
      const W = melee ? MW : RW;
      for (let i = 0; i < 2; i++) {
        if (cle.hp <= 0) break;
        const adv = pal.vow || pal.inv || cle.para;
        const dis = !melee && (dist <= 5 || dist > RW.normal);
        const ar = atkRoll(melee ? palAtk : rAtk, cc.ac, adv, dis, false, palBless(), palBane());
        pal.inv = false;
        if (!ar.hit) { if (say) say(`   Attacco ${i + 1} (${melee ? 'mischia' : 'distanza'}): mancato.`); continue; }
        let crit = ar.crit || (cle.para && dist <= 5);
        if (crit && !cle.para && cle.sd > 0) {
          crit = false; cle.sd--;
          if (say) say('   Sentinella alle Porte della Morte: il critico diventa un colpo normale.');
        }
        const base = d((W.n | 0) * (crit ? 2 : 1), W.die | 0) + (melee ? palDmgB : rBon);
        add(dmgP, 'Arma', base);
        let tot = base; const parts = [`arma ${base}`];
        tot += weaponExtras(W, crit, pal, dmgP, parts);
        if (pal.mark) { const x = d(crit ? 2 : 1, 6); add(dmgP, 'Marchio del Cacciatore', x); tot += x; parts.push(`marchio ${x}`); }
        if (pal.brand) { const x = d(crit ? 4 : 2, 6); pal.brand = false; add(dmgP, 'Marchio Infuocante', x); tot += x; parts.push(`infuocante ${x}`); }
        if (melee) {
          const lv = smiteSlot(crit, tot);
          if (lv) {
            if (lv === 1) pal.s1--; else pal.s2--;
            const x = d((1 + lv) * (crit ? 2 : 1), 8);
            add(dmgP, 'Punizione Divina', x); tot += x; parts.push(`smite lv${lv} ${x}`);
          }
        }
        hurtCle(tot);
        if (say) say(`   Attacco ${i + 1} (${melee ? 'mischia' : 'distanza'}): ${crit ? 'CRITICO ' : ''}${tot} danni (${parts.join(', ')}). Chierico a ${Math.max(0, cle.hp)} PF.`);
      }
    }
  }

  // --------------------------------------------------------------- CHIERICO
  function cleTurn() {
    cle.turn++; cle.turnHit = false;
    if (cle.para) {
      if (say) say('   Il chierico e\' paralizzato: perde il turno.');
      if (saveC(cleSv.wis, palDC, false)) {
        cle.para = false; pal.conc = null;
        if (say) say('   Il chierico si libera da Blocca Persona.');
      }
      return;
    }
    const canT = !pal.inv;
    let slotAct = false, acted = false;
    const reach = dist <= cc.speed + 5;

    if (cle.conc === 'sg' && dist > 15 && pal.rangedLast) dropCleConc();

    // slot piu' basso disponibile; il 4° resta in riserva per Avvizzire se abilitato
    function lowSlot() {
      if (cle.s1 > 0) return 1;
      if (cle.s2 > 0) return 2;
      if (cle.s3 > 0) return 3;
      if (cle.s4 > 0 && !(cc.blight)) return 4;
      return 0;
    }
    function spendSlot(lv) { cle['s' + lv]--; }
    function vtAttack() {
      if (dist > 5) dist = 5;
      const ar = atkRoll(cleAtk, palAC(), pal.para, false, cc.lucky, cleBless(), cleBane());
      if (!ar.hit) { if (say) say('   Tocco Vampirico: mancato.'); return; }
      const crit = ar.crit || pal.para;
      let dmg = d(crit ? 6 : 3, 6);
      if (cle.cursed) { dmg *= 2; cle.cursed = false; if (say) say('   (Sentiero verso la Tomba: danni raddoppiati)'); }
      hurtPal(dmg, 'Tocco Vampirico');
      const heal = Math.floor(dmg / 2);
      cle.hp = Math.min(cle.max, cle.hp + heal);
      if (say) say(`   Tocco Vampirico: ${crit ? 'CRITICO ' : ''}${dmg} danni, il chierico recupera ${heal} PF.`);
    }
    function weaponAttack() {
      if (dist > 5) dist = 5;
      const ar = atkRoll(cleWAtk, palAC(), pal.para, false, cc.lucky, cleBless(), cleBane());
      if (!ar.hit) { if (say) say('   Attacco con l\'arma: mancato.'); return; }
      const crit = ar.crit || pal.para;
      const base = Math.max(0, d((CW.n | 0) * (crit ? 2 : 1), CW.die | 0) + cleWBon);
      const parts = [`arma ${base}`];
      add(dmgC, 'Arma del chierico', base);
      let tot = base + weaponExtras(CW, crit, cle, dmgC, parts);
      if (cle.cursed) {
        add(dmgC, 'Sentiero verso la Tomba (raddoppio)', tot);
        tot *= 2; cle.cursed = false; parts.push('raddoppiato dal Sentiero');
      }
      hurtPal(tot, null);
      if (say) say(`   Attacco con l'arma: ${crit ? 'CRITICO ' : ''}${tot} danni (${parts.join(', ')}).`);
    }

    // 1) concentrazione di apertura
    if (!cle.conc) {
      const op = cc.opening;
      const far = pal.rangedLast && dist > 15;
      let kind = op;
      if (op === 'sg' && far) kind = 'hold';
      if (kind === 'sg' && cle.s3 > 0) {
        cle.s3--; cle.conc = 'sg'; acted = true; slotAct = true;
        if (say) say('   Spirito Guardiano evocato.');
      } else if (kind === 'hold' && cle.s2 > 0 && canT && dist <= 60 && cle.holdTries < 2) {
        cle.s2--; cle.holdTries++; acted = true; slotAct = true;
        if (!saveP(palSv.wis, cleDC, false)) {
          pal.para = true; cle.conc = 'hold'; dropPalConc();
          if (say) say('   Blocca Persona: il paladino e\' PARALIZZATO.');
        } else if (say) say('   Blocca Persona: il paladino resiste.');
      } else if (kind === 'vt' && cle.s3 > 0 && canT && reach) {
        cle.s3--; cle.conc = 'vt'; acted = true; slotAct = true;
        if (say) say('   Tocco Vampirico lanciato.');
        vtAttack();
      } else if (kind === 'bane' && cle.s1 > 0 && canT && dist <= 30) {
        cle.s1--; acted = true; slotAct = true;
        if (!saveP(palSv.cha, cleDC, false)) {
          cle.conc = 'bane'; if (say) say('   Anatema: il paladino e\' maledetto.');
        } else if (say) say('   Anatema: il paladino resiste.');
      } else if (kind === 'bless' && cle.s1 > 0) {
        cle.s1--; cle.conc = 'bless'; acted = true; slotAct = true;
        if (say) say('   Benedizione sul chierico.');
      }
    }
    // 2) paladino paralizzato: Infliggi Ferite (critico automatico)
    if (!acted && pal.para && canT && reach && lowSlot() > 0) {
      const lv = lowSlot();
      spendSlot(lv);
      if (dist > 5) dist = 5;
      let dmg = d((2 + lv) * 2, 10);
      if (cle.cursed) { dmg *= 2; cle.cursed = false; if (say) say('   (Sentiero verso la Tomba: danni raddoppiati)'); }
      hurtPal(dmg, 'Infliggi Ferite');
      acted = true; slotAct = true;
      if (say) say(`   Infliggi Ferite lv${lv} su paladino paralizzato: CRITICO ${dmg} danni.`);
    }
    // 3) Tocco Vampirico continuato
    if (!acted && cle.conc === 'vt' && canT && reach) { vtAttack(); acted = true; }
    // 4) cura
    if (!acted && cle.hp <= cle.max * cc.healThr / 100 && lowSlot() > 0) {
      const lv = lowSlot();
      spendSlot(lv);
      const h = d(lv, 8) + cc.wisMod;
      cle.hp = Math.min(cle.max, cle.hp + h);
      acted = true; slotAct = true;
      if (say) say(`   Cura Ferite lv${lv}: +${h} PF (PF ${cle.hp}).`);
    }
    // 4b) Avvizzire (4° livello, Tomba): 8d8 necrotici, TS Costituzione per meta'
    if (!acted && cc.blight && cle.s4 > 0 && canT && dist <= 30 && !pal.para) {
      cle.s4--; acted = true; slotAct = true;
      let dmg = d(8, 8);
      const ok = saveP(palSv.con, cleDC, false);
      if (ok) dmg = Math.floor(dmg / 2);
      hurtPal(dmg, 'Avvizzire');
      if (say) say(`   Avvizzire: ${dmg} danni necrotici (TS ${ok ? 'riuscito' : 'fallito'}).`);
    }
    // 5) Sentiero verso la Tomba (Incanalare Divinita')
    if (!acted && cc.path && cle.cd > 0 && !cle.cursed && !pal.para && canT && dist <= 30
        && (cle.sw > 0 || cle.conc === 'vt')) {
      cle.cd--; cle.cursed = true; cle.curseTurn = cle.turn + 1; acted = true;
      if (say) say('   Sentiero verso la Tomba: il prossimo colpo contro il paladino infligge il doppio.');
    }
    // 6) azione senza slot: arma oppure Fiamma Sacra
    if (!acted && canT && cc.noSlot === 'weapon' && reach) { weaponAttack(); acted = true; }
    if (!acted && canT && dist <= 60) {
      const potent = cc.potent ? cc.wisMod : 0;
      if (cc.noSlot === 'toll') {
        // Rintocco dei Morti: TS Saggezza, 2d12 se il bersaglio ha perso PF, altrimenti 2d8
        const ok = saveP(palSv.wis, cleDC, false);
        if (!ok) {
          const x = (pal.hp < pal.max ? d(2, 12) : d(2, 8)) + potent; hurtPal(x, 'Rintocco dei Morti');
          if (say) say(`   Rintocco dei Morti: ${x} danni.`);
        } else if (say) say('   Rintocco dei Morti: il paladino resiste.');
      } else {
        const ok = saveP(palSv.dex, cleDC, pal.para);
        if (!ok) {
          const x = d(2, 8) + potent; hurtPal(x, 'Fiamma Sacra');
          if (say) say(`   Fiamma Sacra: ${x} danni.`);
        } else if (say) say('   Fiamma Sacra: il paladino evita.');
      }
      acted = true;
    }
    if (pal.hp <= 0) return;

    // Azione bonus: Arma Spirituale
    if (cle.sw > 0) {
      cle.sw--;
      const ar = atkRoll(cleAtk, palAC(), pal.para, pal.inv, cc.lucky, cleBless(), cleBane());
      if (ar.hit) {
        const crit = ar.crit || pal.para;
        let dmg = d(crit ? 2 : 1, 8) + cc.wisMod;
        if (cle.cursed) { dmg *= 2; cle.cursed = false; if (say) say('   (Sentiero verso la Tomba: danni raddoppiati)'); }
        hurtPal(dmg, 'Arma Spirituale');
        if (say) say(`   Arma Spirituale: ${crit ? 'CRITICO ' : ''}${dmg} danni.`);
      } else if (say) say('   Arma Spirituale: mancato.');
    } else if (!slotAct && cle.s2 > 0 && dist <= 60) {
      cle.s2--; cle.sw = 10;
      if (say) say('   Arma Spirituale evocata.');
    }
    if (cle.cursed && cle.turn >= cle.curseTurn) cle.cursed = false;
  }

  // ------------------------------------------------------------ iniziativa
  const iP = d20raw() + pc.dexMod, iC = d20(cc.lucky, 0) + cc.dexMod;
  const palFirst = iP === iC ? R() < 0.5 : iP > iC;
  const order = palFirst ? ['P', 'C'] : ['C', 'P'];
  if (say) say(`Iniziativa: paladino ${iP}, chierico ${iC}. Parte il ${palFirst ? 'paladino' : 'chierico'}. Distanza ${dist} ft.`);

  for (let rnd = 1; rnd <= cfg.maxRounds; rnd++) {
    if (say) say(`--- Round ${rnd} ---`);
    for (const who of order) {
      if (say) say(`${who === 'P' ? 'Paladino' : 'Chierico'} (PF ${pal.hp} / ${cle.hp}, distanza ${dist} ft)`);
      if (who === 'P') palTurn(); else cleTurn();
      if (pal.hp <= 0) return { winner: 'C', rounds: rnd, hpLeft: cle.hp, dmgP, dmgC, paraRounds: pal.paraRounds, vowUsed: pal.vowUsed };
      if (cle.hp <= 0) return { winner: 'P', rounds: rnd, hpLeft: pal.hp, dmgP, dmgC, paraRounds: pal.paraRounds, vowUsed: pal.vowUsed };
    }
  }
  return { winner: 'D', rounds: cfg.maxRounds, hpLeft: 0, dmgP, dmgC, paraRounds: pal.paraRounds, vowUsed: pal.vowUsed };
}

// ---------- batch di duelli ----------
function newBatch(cfg, n, seed) {
  seedRng(seed);
  return {
    cfg, n, done: 0, wins: { P: 0, C: 0, D: 0 }, hist: new Array(cfg.maxRounds + 1).fill(0),
    sumRounds: 0, sumHpP: 0, sumHpC: 0, dmgP: {}, dmgC: {}, sumPara: 0, paraDuels: 0, vowDuels: 0
  };
}
function stepBatch(b, k) {
  const end = Math.min(b.n, b.done + k);
  for (; b.done < end; b.done++) {
    const r = duel(b.cfg);
    b.wins[r.winner]++;
    b.hist[Math.min(r.rounds, b.cfg.maxRounds)]++;
    b.sumRounds += r.rounds;
    if (r.winner === 'P') b.sumHpP += r.hpLeft;
    if (r.winner === 'C') b.sumHpC += r.hpLeft;
    for (const k2 in r.dmgP) b.dmgP[k2] = (b.dmgP[k2] || 0) + r.dmgP[k2];
    for (const k2 in r.dmgC) b.dmgC[k2] = (b.dmgC[k2] || 0) + r.dmgC[k2];
    b.sumPara += r.paraRounds; if (r.paraRounds > 0) b.paraDuels++;
    if (r.vowUsed) b.vowDuels++;
  }
  return b.done >= b.n;
}
function batchResult(b) {
  const n = b.done || 1;
  const avg = (o) => { const r = {}; for (const k in o) r[k] = o[k] / n; return r; };
  return {
    n: b.done,
    pWin: 100 * b.wins.P / n, cWin: 100 * b.wins.C / n, draw: 100 * b.wins.D / n,
    avgRounds: b.sumRounds / n,
    avgHpP: b.wins.P ? b.sumHpP / b.wins.P : 0,
    avgHpC: b.wins.C ? b.sumHpC / b.wins.C : 0,
    hist: b.hist.slice(), dmgP: avg(b.dmgP), dmgC: avg(b.dmgC),
    paraPct: 100 * b.paraDuels / n, avgPara: b.sumPara / n, vowPct: 100 * b.vowDuels / n,
    se: 100 * Math.sqrt((b.wins.P / n) * (1 - b.wins.P / n) / n)
  };
}
function runBatch(cfg, n, seed) {
  const b = newBatch(cfg, n, seed);
  stepBatch(b, n);
  return batchResult(b);
}
function singleLog(cfg, seed) {
  seedRng(seed);
  const lines = [];
  const r = duel(cfg, (m) => lines.push(m));
  lines.push(r.winner === 'P' ? 'VINCE IL PALADINO' : (r.winner === 'C' ? 'VINCE IL CHIERICO' : 'PAREGGIO (limite di round)'));
  return { lines, result: r };
}

// ---------- confronti automatici ----------
const SWEEPS = {
  smite: { label: 'Politica di Punizione Divina', path: 'pal.smite',
    values: ['never', 'lvl1', 'lvl2', 'always', 'always_high', 'crit', 'smart'],
    names: { never: 'Mai', lvl1: 'Solo slot 1°', lvl2: 'Solo slot 2°', always: 'Slot più basso, ogni colpo', always_high: 'Slot più alto, ogni colpo', crit: 'Solo sui critici', smart: 'Intelligente (slot 2° solo se letale o critico)' } },
  reserve: { label: 'Slot di Punizione Divina tenuti in riserva', path: 'pal.smiteReserve', values: [0, 1, 2, 3, 4],
    names: { 0: 'Nessuna riserva', 1: '1 slot', 2: '2 slot', 3: '3 slot', 4: '4 slot' } },
  hpthr: { label: 'Punizione solo se i PF del chierico sono sotto', path: 'pal.smiteHpThr', values: [100, 75, 50, 30],
    names: { 100: 'Sempre', 75: '75% dei PF', 50: '50% dei PF', 30: '30% dei PF' } },
  ench: { label: 'Incantamento dell\'arma da mischia del paladino', path: 'pal.melee.ench', values: [0, 1, 2, 3],
    names: { 0: 'Arma normale', 1: '+1', 2: '+2', 3: '+3' } },
  cleWeapon: { label: 'Azione del chierico senza slot', path: 'cle.noSlot', values: ['flame', 'toll', 'weapon'],
    names: { flame: 'Fiamma Sacra', toll: 'Rintocco dei Morti', weapon: 'Attacco con l\'arma' } },
  blight: { label: 'Avvizzire del chierico (4° livello)', path: 'cle.blight', values: [false, true], names: { false: 'No', true: 'Sì' } },
  sentinel: { label: 'Sentinella alle Porte della Morte (usi)', path: 'cle.sentinel', values: [0, 2, 5], names: { 0: 'Nessun uso', 2: '2 usi', 5: '5 usi' } },
  aura: { label: 'Aura di Protezione del paladino', path: 'pal.aura', values: [false, true], names: { false: 'No', true: 'Sì' } },
  dist: { label: 'Distanza iniziale', path: 'dist', values: [5, 15, 30, 60, 90],
    names: { 5: '5 ft', 15: '15 ft', 30: '30 ft', 60: '60 ft', 90: '90 ft' } },
  ranged: { label: 'Round di attacco a distanza prima di caricare', path: 'pal.rangedRounds', values: [0, 1, 2, 3, 99],
    names: { 0: 'Carica subito', 1: '1 round', 2: '2 round', 3: '3 round', 99: 'Sempre a distanza' } },
  bonusSpell: { label: 'Incantesimo del paladino con azione bonus', path: 'pal.bonusSpell',
    values: ['none', 'hm', 'branding', 'sof'],
    names: { none: 'Nessuno', hm: 'Marchio del Cacciatore', branding: 'Marchio Infuocante', sof: 'Scudo della Fede' } },
  actionSpell: { label: 'Incantesimo d\'apertura del paladino (azione)', path: 'pal.actionSpell',
    values: ['none', 'hold', 'bane', 'bless'],
    names: { none: 'Nessuno', hold: 'Blocca Persona', bane: 'Anatema', bless: 'Benedizione' } },
  vow: { label: 'Voto di Inimicizia', path: 'pal.vow', values: [false, true], names: { false: 'No', true: 'Sì' } },
  hidden: { label: 'Passo Nascosto del Firbolg', path: 'pal.hidden', values: [false, true], names: { false: 'No', true: 'Sì' } },
  misty: { label: 'Passo Velato', path: 'pal.misty', values: [false, true], names: { false: 'No', true: 'Sì' } },
  opening: { label: 'Apertura del chierico', path: 'cle.opening', values: ['sg', 'hold', 'vt', 'bane', 'bless'],
    names: { sg: 'Spirito Guardiano', hold: 'Blocca Persona', vt: 'Tocco Vampirico', bane: 'Anatema', bless: 'Benedizione' } },
  path: { label: 'Sentiero verso la Tomba', path: 'cle.path', values: [false, true], names: { false: 'No', true: 'Sì' } }
};
function setPath(obj, path, val) {
  const p = path.split('.');
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = val;
}
function sweepRun(cfg, key, n, seed, onRow) {
  const sw = SWEEPS[key], rows = [];
  for (const v of sw.values) {
    const c = JSON.parse(JSON.stringify(cfg));
    setPath(c, sw.path, v);
    const r = runBatch(c, n, seed);
    const row = { name: sw.names[v], pWin: r.pWin, cWin: r.cWin, draw: r.draw, avgRounds: r.avgRounds, se: r.se };
    rows.push(row);
    if (onRow) onRow(row);
  }
  return rows;
}

// ---------- analisi esatta (probabilita' per round del paladino) ----------
function pHit(atk, ac, adv, dis) {
  const p = Math.min(0.95, Math.max(0.05, (21 - (ac - atk)) / 20));
  if (adv && !dis) return 1 - (1 - p) * (1 - p);
  if (dis && !adv) return p * p;
  return p;
}
function analytic(cfg) {
  const pc = cfg.pal, cc = cfg.cle, MW = pc.melee, RW = pc.ranged;
  const ex = (w, p, pcrit, p1) => {
    let t = 0;
    for (const e of (w.extras || [])) {
      const dice = (e.n | 0) * ((e.die | 0) + 1) / 2, avg = dice + (e.bonus | 0);
      if (e.trigger === 'crit') t += pcrit * avg;
      else if (e.trigger === 'turn' || e.trigger === 'first') t += p1 * avg / 2;
      else t += p * avg + pcrit * dice;
    }
    return t;
  };
  const rows = [];
  function row(name, atk, w, bonus, smiteDice, adv, dis) {
    const p = pHit(atk, cc.ac, adv, dis);
    const pcrit = adv && !dis ? 1 - 0.95 * 0.95 : (dis && !adv ? 0.0025 : 0.05);
    const p1 = 1 - (1 - p) * (1 - p);
    const wd = (w.n | 0) * ((w.die | 0) + 1) / 2;
    const att = p * (wd + bonus) + pcrit * wd + ex(w, p, pcrit, p1) + (p + pcrit) * smiteDice;
    const rnd = att * 2;
    rows.push({ name, p: p * 100, att, rnd, p1: p1 * 100, rounds: cc.hp / rnd });
  }
  const mAtk = pc.strMod + pc.prof + (MW.ench | 0);
  const mBon = pc.strMod + (pc.style === 'duel' ? 2 : 0) + (MW.ench | 0);
  const rMod = RW.abil === 'dex' ? pc.dexMod : pc.strMod;
  const rAtk = rMod + pc.prof + (RW.ench | 0), rBon = rMod + (RW.ench | 0);
  row('Arma da mischia, senza smite', mAtk, MW, mBon, 0, false, false);
  row('Arma da mischia con vantaggio (Voto di Inimicizia)', mAtk, MW, mBon, 0, true, false);
  row('Mischia + Punizione lv 1', mAtk, MW, mBon, 9, false, false);
  row('Mischia + Punizione lv 2', mAtk, MW, mBon, 13.5, false, false);
  row('Mischia con vantaggio + Punizione lv 1', mAtk, MW, mBon, 9, true, false);
  row('Mischia con vantaggio + Punizione lv 2', mAtk, MW, mBon, 13.5, true, false);
  row('Arma a distanza, gittata normale', rAtk, RW, rBon, 0, false, false);
  row('Arma a distanza, gittata lunga (svantaggio)', rAtk, RW, rBon, 0, false, true);
  return rows;
}

if (typeof module !== 'undefined') {
  module.exports = { defaults, duel, runBatch, singleLog, sweepRun, SWEEPS, analytic, seedRng, newBatch, stepBatch, batchResult };
}

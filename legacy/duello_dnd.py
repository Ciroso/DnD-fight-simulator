#!/usr/bin/env python3
"""
Simulatore di duello D&D 5e: Paladino vs Chierico (1 contro 1), con distanza.

NOTE DI REGOLA IMPORTANTI
 - Punizione Divina (Divine Smite) funziona SOLO su un attacco con arma da MISCHIA.
   Quindi a distanza il paladino non puo' usarla.
 - L'alternativa "incantesimo" per colpire da lontano con un'arma e' Marchio Infuocante
   (Branding Smite, 2 lv, azione bonus, concentrazione): +2d6 radiosi al prossimo colpo
   con arma, anche a distanza. Il paladino di lv 5 ha anche Marchio (Searing/Thunderous/
   Wrathful Smite) ma sono solo per la mischia.
 - Il paladino non ha incantesimi offensivi a distanza propri al lv 5.

Uso:
    python duello_dnd.py --analisi                  # probabilita' e danni attesi (calcolo esatto)
    python duello_dnd.py --matrice -n 20000         # confronto strategie del paladino (simulazione)
    python duello_dnd.py --livelli-smite -n 20000   # confronto livelli di Punizione Divina
    python duello_dnd.py -n 20000 --round-distanza 1 --branding --smite lvl1
    python duello_dnd.py --distanza-inizio 60 --arma-distanza arco_lungo --round-distanza 99

Opzioni principali:
    --distanza-inizio FT   distanza iniziale in piedi (default 30; 5 = corpo a corpo)
    --round-distanza N     il paladino attacca a distanza per i primi N round, poi carica
                           (0 = carica subito, 99 = resta sempre a distanza)
    --arma-distanza        giavellotto | arco_lungo
    --branding             il paladino lancia Marchio Infuocante (slot di 2 lv) prima di colpire
    --smite POLITICA       never | always | always_high | crit | lvl1 | lvl2
                           always = usa lo slot piu' basso su ogni colpo in mischia
                           always_high = usa lo slot piu' alto su ogni colpo in mischia
                           crit = slot piu' alto solo sui critici
                           lvl1 / lvl2 = usa solo slot di quel livello
    --opening              guardiani | hold_person | both  (apertura del chierico)

Per cambiare livello/statistiche modifica i dizionari PALADINO e CHIERICO qui sotto.
Default: entrambi livello 5, array standard, armatura + scudo.
"""
import argparse
import random
import statistics

# ----------------------------------------------------------------------------
# CONFIGURAZIONE PERSONAGGI (modificabile)
# ----------------------------------------------------------------------------
PALADINO = dict(
    hp=44, ac=18,
    atk=7,              # FOR +4, competenza +3
    dmg_dado=8, dmg_bonus=4,   # spada lunga + scudo (1d8+4)
    attacchi=2,         # Attacco Extra
    slot={1: 4, 2: 2},
    imposizione=25,     # riserva Imposizione delle Mani (5 x livello)
    soglia_cura=0.35,   # sotto questa % di PF usa Imposizione delle Mani
    velocita=30,
    tc_des=0, tc_sag=0, tc_cos=2,   # bonus ai tiri salvezza
)
ARMI_DISTANZA = {
    # atk = bonus al tiro per colpire, normale/lunga = gittata in piedi
    "giavellotto": dict(dado=6, bonus=4, atk=7, normale=30, lunga=120),  # FOR
    "arco_lungo": dict(dado=8, bonus=0, atk=3, normale=150, lunga=600),  # DES +0, competenza +3
}
CHIERICO = dict(
    hp=38, ac=18,
    atk_inc=7,          # attacco con incantesimo: SAG +4, competenza +3
    cd=15,              # CD incantesimi
    mod_sag=4,
    slot={1: 4, 2: 3, 3: 2},
    soglia_cura=0.30,
    velocita=30,
    tc_des=0, tc_cos=2,
)
MAX_ROUND = 30


# ----------------------------------------------------------------------------
# UTILITA'
# ----------------------------------------------------------------------------
def d(n, facce):
    return sum(random.randint(1, facce) for _ in range(n))


def d20():
    return random.randint(1, 20)


def attacco(bonus, ca, vantaggio=False, svantaggio=False, crit_auto=False):
    """Ritorna (colpito, critico). 1 naturale manca sempre, 20 colpisce sempre."""
    r = d20()
    if vantaggio and not svantaggio:
        r = max(r, d20())
    elif svantaggio and not vantaggio:
        r = min(r, d20())
    if r == 1:
        return False, False
    crit = r == 20
    colpito = crit or (r + bonus >= ca)
    if colpito and crit_auto:
        crit = True
    return colpito, crit


# ----------------------------------------------------------------------------
# SIMULAZIONE DI UN DUELLO
# ----------------------------------------------------------------------------
def duello(apertura, opt):
    P, C = PALADINO, CHIERICO
    smite = opt["smite"]
    round_dist = opt["round_distanza"]
    arma = ARMI_DISTANZA[opt["arma_distanza"]]

    pal_hp, cle_hp = P["hp"], C["hp"]
    pal_slot, cle_slot = dict(P["slot"]), dict(C["slot"])
    loh = P["imposizione"]
    dist = opt["distanza_inizio"]

    conc = None                 # concentrazione chierico: None / 'guardiani' / 'hold'
    pal_paralizzato = False
    pal_branding = False        # Marchio Infuocante attivo e non ancora scaricato
    pal_round = 0
    pal_usa_distanza_ultimo = False
    arma_spirituale = 0
    sw_avvicinamento = 0
    round_paralizzato = 0

    def danno_paladino(dmg):
        nonlocal pal_hp, pal_branding
        pal_hp -= dmg
        if pal_hp > 0 and pal_branding:
            if d20() + P["tc_cos"] < max(10, dmg // 2):
                pal_branding = False

    def danno_chierico(dmg):
        nonlocal cle_hp, conc, pal_paralizzato
        cle_hp -= dmg
        if cle_hp > 0 and conc:
            if d20() + C["tc_cos"] < max(10, dmg // 2):
                conc = None
                pal_paralizzato = False

    def scegli_slot(crit):
        livelli = [l for l, n in pal_slot.items() if n > 0]
        if smite == "never" or not livelli:
            return None
        if smite == "always":
            return min(livelli)
        if smite == "always_high":
            return max(livelli)
        if smite == "crit":
            return max(livelli) if crit else None
        if smite == "lvl1":
            return 1 if 1 in livelli else None
        if smite == "lvl2":
            return 2 if 2 in livelli else None
        return None

    def turno_paladino():
        nonlocal pal_hp, loh, round_paralizzato, pal_paralizzato, dist
        nonlocal pal_branding, pal_round, pal_usa_distanza_ultimo
        inizio = dist
        # Spirito Guardiano: danno a inizio turno se entro 4.5 m (15 ft)
        if conc == "guardiani" and dist <= 15:
            dmg = d(3, 8)
            if d20() + P["tc_sag"] >= C["cd"]:
                dmg //= 2
            danno_paladino(dmg)
            if pal_hp <= 0:
                return
        if pal_paralizzato:
            round_paralizzato += 1
            if d20() + P["tc_sag"] >= C["cd"]:
                pal_paralizzato = False
            return
        if pal_hp <= P["hp"] * P["soglia_cura"] and loh > 0:
            cura = min(loh, P["hp"] - pal_hp)
            pal_hp += cura
            loh -= cura
            return
        pal_round += 1

        # Marchio Infuocante (azione bonus) prima del primo attacco
        if opt["branding"] and not pal_branding and not opt.get("_branding_fatto") \
                and pal_slot[2] > 0 and not state_branding_usato():
            pal_slot[2] -= 1
            pal_branding = True
            set_branding_usato()

        usa_distanza = pal_round <= round_dist and dist > 5
        pal_usa_distanza_ultimo = usa_distanza
        n_att = P["attacchi"]
        tipo = "mischia"

        if usa_distanza:
            if dist > arma["lunga"]:
                # troppo lontano: si avvicina
                dist -= min(P["velocita"], dist - 5)
                return
            tipo = "distanza"
        else:
            if dist > 5:
                mov = min(P["velocita"], dist - 5)
                dist -= mov
                if dist > 5:           # Scatto: nessun attacco
                    dist -= min(P["velocita"], dist - 5)
                    entra_guardiani(inizio)
                    return
                entra_guardiani(inizio)
                if pal_hp <= 0:
                    return

        for _ in range(n_att):
            if cle_hp <= 0:
                break
            if tipo == "distanza":
                svant = dist <= 5 or dist > arma["normale"]
                colpito, crit = attacco(arma["atk"], C["ac"], svantaggio=svant)
                if not colpito:
                    continue
                dmg = d(2 if crit else 1, arma["dado"]) + arma["bonus"]
            else:
                colpito, crit = attacco(P["atk"], C["ac"])
                if not colpito:
                    continue
                dmg = d(2 if crit else 1, P["dmg_dado"]) + P["dmg_bonus"]
            if pal_branding:
                dmg += d(4 if crit else 2, 6)      # Marchio Infuocante: 2d6 radiosi, una volta
                pal_branding = False
            if tipo == "mischia":                   # Punizione Divina solo in mischia
                lv = scegli_slot(crit)
                if lv:
                    pal_slot[lv] -= 1
                    dmg += d(min(5, 1 + lv) * (2 if crit else 1), 8)
            danno_chierico(dmg)

    # piccolo stato per "Marchio gia' lanciato" (una sola volta per duello)
    _flag = {"b": False}

    def state_branding_usato():
        return _flag["b"]

    def set_branding_usato():
        _flag["b"] = True

    def entra_guardiani(inizio):
        # entrare nell'area per la prima volta in un turno infligge il danno
        if conc == "guardiani" and inizio > 15 and dist <= 15:
            dmg = d(3, 8)
            if d20() + P["tc_sag"] >= C["cd"]:
                dmg //= 2
            danno_paladino(dmg)

    def turno_chierico():
        nonlocal cle_hp, conc, pal_hp, pal_paralizzato, arma_spirituale
        nonlocal sw_avvicinamento, dist
        azione_slot = False

        # Se il paladino resta a distanza, Spirito Guardiano e' inutile: lo molla
        if conc == "guardiani" and dist > 15 and pal_usa_distanza_ultimo:
            conc = None

        if conc is None and apertura == "guardiani" and cle_slot[3] > 0 \
                and not (pal_usa_distanza_ultimo and dist > 15):
            cle_slot[3] -= 1
            conc = "guardiani"
            azione_slot = True
        elif conc is None and cle_slot[2] > 0 and dist <= 60 \
                and (apertura == "hold_person" or pal_usa_distanza_ultimo):
            cle_slot[2] -= 1
            azione_slot = True
            if d20() + P["tc_sag"] < C["cd"]:
                conc = "hold"
                pal_paralizzato = True
        elif pal_paralizzato and cle_slot[1] > 0 and dist <= C["velocita"] + 5:
            # si avvicina e Infligge Ferite: colpo automatico critico (6d10)
            dist = 5
            cle_slot[1] -= 1
            danno_paladino(d(6, 10))
            azione_slot = True
        elif cle_hp <= C["hp"] * C["soglia_cura"] and any(cle_slot[l] > 0 for l in (1, 2, 3)):
            lv = min(l for l in (1, 2, 3) if cle_slot[l] > 0)
            cle_slot[lv] -= 1
            cle_hp = min(C["hp"], cle_hp + d(lv, 8) + C["mod_sag"])
            azione_slot = True
        elif dist <= 60:
            # Fiamma Sacra (trucchetto, 2d8): TS Destrezza
            if pal_paralizzato or d20() + P["tc_des"] < C["cd"]:
                danno_paladino(d(2, 8))
        if pal_hp <= 0:
            return

        # Azione bonus: Arma Spirituale
        if arma_spirituale > 0:
            if dist - sw_avvicinamento > 5:
                sw_avvicinamento += 20          # si muove di 6 m, poi attacca se arriva
            if dist - sw_avvicinamento <= 5:
                colpito, crit = attacco(C["atk_inc"], P["ac"],
                                        vantaggio=pal_paralizzato, crit_auto=pal_paralizzato)
                if colpito:
                    danno_paladino(d(2 if crit else 1, 8) + C["mod_sag"])
            arma_spirituale -= 1
        elif not azione_slot and cle_slot[2] > 0 and dist <= 60:
            cle_slot[2] -= 1
            arma_spirituale = 10
            sw_avvicinamento = 0

    # Iniziativa (DES +0 per entrambi), pareggio = si ritira
    while True:
        ip, ic = d20(), d20()
        if ip != ic:
            break
    ordine = ["P", "C"] if ip > ic else ["C", "P"]

    for rnd in range(1, MAX_ROUND + 1):
        for chi in ordine:
            if chi == "P":
                turno_paladino()
            else:
                turno_chierico()
            if pal_hp <= 0:
                return "Chierico", rnd, cle_hp, round_paralizzato
            if cle_hp <= 0:
                return "Paladino", rnd, pal_hp, round_paralizzato
    return "Pareggio", MAX_ROUND, 0, round_paralizzato


# ----------------------------------------------------------------------------
# SIMULAZIONE E STATISTICHE
# ----------------------------------------------------------------------------
def opzioni(a=None, **kw):
    o = dict(smite="always", round_distanza=0, arma_distanza="giavellotto",
             branding=False, distanza_inizio=30)
    if a is not None:
        o.update(smite=a.smite, round_distanza=a.round_distanza,
                 arma_distanza=a.arma_distanza, branding=a.branding,
                 distanza_inizio=a.distanza_inizio)
    o.update(kw)
    return o


def simula(n, apertura, opt):
    return [duello(apertura, dict(opt)) for _ in range(n)]


def percentuali(esiti):
    n = len(esiti)
    return {k: 100 * sum(1 for e in esiti if e[0] == k) / n
            for k in ("Paladino", "Chierico", "Pareggio")}


def report(n, apertura, opt):
    esiti = simula(n, apertura, opt)
    pc = percentuali(esiti)
    print(f"\n=== {n} duelli | apertura chierico: {apertura} | {descr(opt)} ===")
    for k, v in pc.items():
        print(f"  {k:9s}: {v:5.1f}%")
    print(f"  Durata media: {statistics.mean(e[1] for e in esiti):.2f} round")
    for k in ("Paladino", "Chierico"):
        pf = [e[2] for e in esiti if e[0] == k]
        if pf:
            print(f"  PF medi rimasti al vincitore ({k}): {statistics.mean(pf):.1f}")
    print(f"  Round medi in cui il paladino e' paralizzato: "
          f"{statistics.mean(e[3] for e in esiti):.2f}")


def descr(o):
    if o["round_distanza"] == 0:
        appr = "carica subito"
    elif o["round_distanza"] >= 99:
        appr = f"solo distanza ({o['arma_distanza']})"
    else:
        appr = f"{o['round_distanza']} round di distanza ({o['arma_distanza']}) poi carica"
    s = f"partenza {o['distanza_inizio']} ft, {appr}, smite={o['smite']}"
    if o["branding"]:
        s += ", +Marchio Infuocante"
    return s


# ----------------------------------------------------------------------------
# ANALISI ESATTA (probabilita' e danni attesi per round, senza simulare)
# ----------------------------------------------------------------------------
def p_colpo(atk, ca, vant=False, svant=False):
    p = min(0.95, max(0.05, (21 - (ca - atk)) / 20))
    pc = 0.05
    if vant and not svant:
        return 1 - (1 - p) ** 2, 1 - (1 - pc) ** 2
    if svant and not vant:
        return p ** 2, pc ** 2
    return p, pc


def analisi(dist):
    P, C = PALADINO, CHIERICO
    ca = C["ac"]
    print(f"\nANALISI ESATTA contro CA {ca} del chierico (media su 2 attacchi per round, {C['hp']} PF)")
    print(f"{'Opzione':46s} {'P(colpo)':>9s} {'dmg/att':>8s} {'dmg/round':>10s} "
          f"{'P(>=1 colpo)':>13s} {'round per 0 PF':>15s}")

    def stampa(nome, atk, ndadi, facce, bonus, extra_dadi_avg=0.0, svant=False):
        p, pc = p_colpo(atk, ca, svant=svant)
        media_dadi = ndadi * (facce + 1) / 2
        e_att = p * (media_dadi + bonus) + pc * media_dadi
        e_extra = (p + pc) * extra_dadi_avg
        e_att += e_extra
        e_round = e_att * P["attacchi"]
        p1 = 1 - (1 - p) ** P["attacchi"]
        r0 = C["hp"] / e_round
        print(f"{nome:46s} {100 * p:8.1f}% {e_att:8.2f} {e_round:10.2f} {100 * p1:12.1f}% {r0:15.2f}")

    stampa("Mischia, spada lunga (no smite)", P["atk"], 1, P["dmg_dado"], P["dmg_bonus"])
    for lv in (1, 2):
        dadi = min(5, 1 + lv)
        stampa(f"Mischia + Punizione Divina lv {lv} (ogni colpo)", P["atk"], 1, P["dmg_dado"],
               P["dmg_bonus"], extra_dadi_avg=dadi * 4.5)
    for nome, w in ARMI_DISTANZA.items():
        stampa(f"Distanza: {nome} (gittata normale)", w["atk"], 1, w["dado"], w["bonus"])
        stampa(f"Distanza: {nome} (gittata lunga, svant.)", w["atk"], 1, w["dado"], w["bonus"], svant=True)
    w = ARMI_DISTANZA["giavellotto"]
    p, pc = p_colpo(w["atk"], ca)
    p1 = 1 - (1 - p) ** P["attacchi"]
    print(f"\nMarchio Infuocante (slot 2 lv): +2d6 = 7.0 dmg medi, una sola volta, sul primo colpo.")
    print(f"  P(il primo round ne scarica l'extra) con giavellotto: {100 * p1:.1f}%")
    print("\nValore marginale di uno slot di Punizione Divina (solo mischia):")
    for lv in (1, 2):
        dadi = min(5, 1 + lv)
        print(f"  slot lv {lv}: {dadi}d8 = {dadi * 4.5:.1f} dmg extra per ogni uso (raddoppiano sui critici)")
    print("\nNota: la decisione di smite si prende dopo aver visto il colpo, quindi lo slot "
          "non e' mai sprecato su un mancato.")


# ----------------------------------------------------------------------------
# MATRICI DI CONFRONTO
# ----------------------------------------------------------------------------
def tabella(n, righe, aperture=("guardiani", "hold_person")):
    head = f"{'Strategia del paladino':58s}" + "".join(f"{'vs ' + a:>22s}" for a in aperture)
    print(head)
    for nome, opt in righe:
        celle = []
        for ap in aperture:
            pc = percentuali(simula(n, ap, opt))
            celle.append(f"{pc['Paladino']:5.1f}% pal / {pc['Chierico']:4.1f}% cle")
        print(f"{nome:58s}" + "".join(f"{c:>22s}" for c in celle))


def matrice(n, a):
    base = opzioni(a)
    print(f"\nCONFRONTO STRATEGIE DEL PALADINO ({n} duelli ciascuna, partenza {a.distanza_inizio} ft, "
          f"smite={a.smite})")
    righe = [
        ("Carica subito", opzioni(a, round_distanza=0, branding=False)),
        ("Carica subito + Marchio Infuocante", opzioni(a, round_distanza=0, branding=True)),
        ("1 round a distanza poi carica", opzioni(a, round_distanza=1, branding=False)),
        ("1 round a distanza + Marchio Infuocante, poi carica", opzioni(a, round_distanza=1, branding=True)),
        ("2 round a distanza poi carica", opzioni(a, round_distanza=2, branding=False)),
        ("Resta sempre a distanza", opzioni(a, round_distanza=99, branding=False)),
        ("Resta sempre a distanza + Marchio Infuocante", opzioni(a, round_distanza=99, branding=True)),
    ]
    tabella(n, righe)


def livelli_smite(n, a):
    print(f"\nCONFRONTO LIVELLI DI PUNIZIONE DIVINA ({n} duelli ciascuna, partenza {a.distanza_inizio} ft, "
          f"carica subito)")
    righe = []
    for nome, pol in [("Mai", "never"), ("Solo slot lv 1", "lvl1"), ("Solo slot lv 2", "lvl2"),
                      ("Lv piu' basso disponibile, ogni colpo", "always"),
                      ("Lv piu' alto disponibile, ogni colpo", "always_high"),
                      ("Solo sui critici (lv piu' alto)", "crit")]:
        righe.append((f"Smite: {nome}", opzioni(a, smite=pol, round_distanza=0, branding=False)))
    tabella(n, righe)


def main():
    ap = argparse.ArgumentParser(description="Duello D&D 5e Paladino vs Chierico",
                                 formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__)
    ap.add_argument("-n", "--num", type=int, default=10000, help="numero di duelli")
    ap.add_argument("--opening", choices=["guardiani", "hold_person", "both"], default="both")
    ap.add_argument("--smite", choices=["never", "always", "always_high", "crit", "lvl1", "lvl2"],
                    default="always")
    ap.add_argument("--distanza-inizio", type=int, default=30, help="distanza iniziale in ft")
    ap.add_argument("--round-distanza", type=int, default=0,
                    help="round di attacco a distanza prima di caricare (99 = sempre)")
    ap.add_argument("--arma-distanza", choices=list(ARMI_DISTANZA), default="giavellotto")
    ap.add_argument("--branding", action="store_true", help="usa Marchio Infuocante")
    ap.add_argument("--analisi", action="store_true", help="probabilita' e danni attesi esatti")
    ap.add_argument("--matrice", action="store_true", help="confronta le strategie di avvicinamento")
    ap.add_argument("--livelli-smite", action="store_true", help="confronta i livelli di smite")
    ap.add_argument("--seed", type=int, default=None)
    a = ap.parse_args()
    if a.seed is not None:
        random.seed(a.seed)

    if a.analisi:
        analisi(a.distanza_inizio)
    if a.matrice:
        matrice(a.num, a)
    if a.livelli_smite:
        livelli_smite(a.num, a)
    if not (a.analisi or a.matrice or a.livelli_smite):
        aperture = ["guardiani", "hold_person"] if a.opening == "both" else [a.opening]
        for ap_ in aperture:
            report(a.num, ap_, opzioni(a))


if __name__ == "__main__":
    main()

export interface HerbDictionaryEntry {
  commonNames: string[];
  botanicalName: string;
  partUsed?: string;
  category?: string;
  isScheduleE1?: boolean;
  monographRef?: string;
}

export const AYURVEDIC_HERB_DICTIONARY: HerbDictionaryEntry[] = [
  {
    commonNames: ['ASHWAGANDHA', 'ASGANDH', 'WINTER CHERRY', 'INDIAN GINSENG', 'WITHANIA'],
    botanicalName: 'Withania somnifera (L.) Dunal',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 15'
  },
  {
    commonNames: ['GUGGULU', 'PURIFIED GUGGULU', 'SHUDDHA GUGGULU', 'GUGGAL', 'BDELLIUM'],
    botanicalName: 'Commiphora mukul (Arn.) Bhandari',
    partUsed: 'Resin / Gum (Niryasa)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 43'
  },
  {
    commonNames: ['TULSI', 'TULASI', 'HOLY BASIL', 'RAMA TULSI', 'SHYAMA TULSI'],
    botanicalName: 'Ocimum sanctum L.',
    partUsed: 'Leaf (Patra)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol II, Page 165'
  },
  {
    commonNames: ['HARITAKI', 'HARAD', 'HARDH', 'CHEBULIC MYROBALAN'],
    botanicalName: 'Terminalia chebula Retz.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 47'
  },
  {
    commonNames: ['BIBHITAKI', 'BAHEDA', 'BELLERIC MYROBALAN'],
    botanicalName: 'Terminalia bellirica (Gaertn.) Roxb.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 26'
  },
  {
    commonNames: ['AMLA', 'AMALAKI', 'INDIAN GOOSEBERRY'],
    botanicalName: 'Phyllanthus emblica L.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 5'
  },
  {
    commonNames: ['SHATAVARI', 'SATAVARI', 'SATAVAR'],
    botanicalName: 'Asparagus racemosus Willd.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol IV, Page 108'
  },
  {
    commonNames: ['GUDUCHI', 'GILOY', 'AMRITA', 'GURJO'],
    botanicalName: 'Tinospora cordifolia (Willd.) Hook.f. & Thomson',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 41'
  },
  {
    commonNames: ['NEEM', 'NIMBA', 'MARGOSA'],
    botanicalName: 'Azadirachta indica A. Juss.',
    partUsed: 'Leaf (Patra)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 115'
  },
  {
    commonNames: ['BRAHMI', 'THYME LEAVED GRATIOLA'],
    botanicalName: 'Bacopa monnieri (L.) Wettst.',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol II, Page 25'
  },
  {
    commonNames: ['BHRINGRAJ', 'BHIRINGRAJ', 'KESHARATNA'],
    botanicalName: 'Eclipta alba (L.) Hassk.',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol II, Page 21'
  },
  {
    commonNames: ['ARJUNA', 'ARJUN', 'ARJUNA CHHAL'],
    botanicalName: 'Terminalia arjuna (Roxb. ex DC.) Wight & Arn.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 17'
  },
  {
    commonNames: ['MULETHI', 'YASHTIMADHU', 'LICORICE', 'JESTHAMADH'],
    botanicalName: 'Glycyrrhiza glabra L.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 128'
  },
  {
    commonNames: ['PIPPALI', 'PIPALI', 'LONG PEPPER'],
    botanicalName: 'Piper longum L.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol IV, Page 91'
  },
  {
    commonNames: ['SUNTHI', 'SONTH', 'DRY GINGER', 'ADRAK'],
    botanicalName: 'Zingiber officinale Roscoe',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 103'
  },
  {
    commonNames: ['MARICHA', 'KALI MIRCH', 'BLACK PEPPER'],
    botanicalName: 'Piper nigrum L.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 115'
  },
  {
    commonNames: ['VATSANABHA', 'INDIAN ACONITE', 'MEETHA ZAHAR', 'POISON ACONITE'],
    botanicalName: 'Aconitum ferox Wall. ex Ser.',
    partUsed: 'Root (Mool)',
    category: 'Schedule E1',
    isScheduleE1: true,
    monographRef: 'API Part I, Vol III, Page 217'
  },
  {
    commonNames: ['JAYAPALA', 'CROTON SEED', 'JAMALGOTA'],
    botanicalName: 'Croton tiglium L.',
    partUsed: 'Seed (Beej)',
    category: 'Schedule E1',
    isScheduleE1: true,
    monographRef: 'API Part I, Vol IV, Page 33'
  },
  {
    commonNames: ['BHANG', 'VIJAYA', 'CANNABIS LEAF'],
    botanicalName: 'Cannabis sativa L.',
    partUsed: 'Leaf (Patra)',
    category: 'Schedule E1',
    isScheduleE1: true,
    monographRef: 'API Part I, Vol I, Page 120'
  },
  {
    commonNames: ['BAKUCHI', 'BAVCHI'],
    botanicalName: 'Psoralea corylifolia L.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 14'
  },
  {
    commonNames: ['CHITRAK', 'CHITRAKA'],
    botanicalName: 'Plumbago zeylanica L.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 39'
  },
  {
    commonNames: ['KUTAJ', 'KUTAJA', 'HOLARRHENA BARK'],
    botanicalName: 'Holarrhena antidysenterica Wall.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 78'
  },
  {
    commonNames: ['SHALLAKI', 'BOSWELLIA', 'INDIAN FRANKINCENSE', 'SALAI GUGGUL'],
    botanicalName: 'Boswellia serrata Roxb.',
    partUsed: 'Resin / Gum (Niryasa)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol IV, Page 101'
  },
  {
    commonNames: ['MANJISTHA', 'INDIAN MADDER'],
    botanicalName: 'Rubia cordifolia L.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 112'
  },
  {
    commonNames: ['PUNARNAVA', 'BOERHAVIA'],
    botanicalName: 'Boerhavia diffusa L.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 93'
  },
  {
    commonNames: ['GOKSHURA', 'GOKHRU', 'PUNCTURE VINE'],
    botanicalName: 'Tribulus terrestris L.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 38'
  },
  {
    commonNames: ['KANCHANAR', 'KACHNAR'],
    botanicalName: 'Bauhinia variegata L.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 53'
  },
  {
    commonNames: ['VASAKA', 'VASA', 'MALABAR NUT', 'ADULSA'],
    botanicalName: 'Adhatoda vasica Nees',
    partUsed: 'Leaf (Patra)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol I, Page 119'
  },
  {
    commonNames: ['VIDANGA', 'VAIVDING', 'FALSE BLACK PEPPER'],
    botanicalName: 'Embelia ribes Burm.f.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 123'
  },
  {
    commonNames: ['KAPIKACHHU', 'KAUNCH', 'VELVET BEAN'],
    botanicalName: 'Mucuna pruriens (L.) DC.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 85'
  },
  {
    commonNames: ['BALA', 'COUNTRY MALLOW'],
    botanicalName: 'Sida cordifolia L.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 24'
  },
  {
    commonNames: ['KUMKUMA', 'SAFFRON', 'KESAR'],
    botanicalName: 'Crocus sativus L.',
    partUsed: 'Flower (Pushpa)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol IV, Page 61'
  },
  {
    commonNames: ['JAIPHAL', 'JATIPHALA', 'NUTMEG'],
    botanicalName: 'Myristica fragrans Houtt.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 49'
  },
  {
    commonNames: ['LAVANGA', 'LAUNG', 'CLOVE'],
    botanicalName: 'Syzygium aromaticum (L.) Merr. & L.M.Perry',
    partUsed: 'Flower (Pushpa)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 73'
  },
  {
    commonNames: ['ELA', 'ELACHI', 'CARDAMOM', 'CHOTI ELAICHI'],
    botanicalName: 'Elettaria cardamomum (L.) Maton',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 31'
  },
  {
    commonNames: ['DALCHINI', 'TWAK', 'CINNAMON'],
    botanicalName: 'Cinnamomum verum J.Presl',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 113'
  },
  {
    commonNames: ['TEJPATTA', 'INDIAN BAY LEAF'],
    botanicalName: 'Cinnamomum tamala (Buch.-Ham.) Nees & Eberm.',
    partUsed: 'Leaf (Patra)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 109'
  },
  {
    commonNames: ['NAGAKESARA', 'NAGKESAR'],
    botanicalName: 'Mesua ferrea L.',
    partUsed: 'Flower (Pushpa)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 121'
  },
  {
    commonNames: ['SHANKHAPUSHPI', 'SHANKHPUSHPI'],
    botanicalName: 'Convolvulus pluricaulis Choisy',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 147'
  },
  {
    commonNames: ['JATAMANSI', 'SPIKENARD'],
    botanicalName: 'Nardostachys jatamansi (D.Don) DC.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 51'
  },
  {
    commonNames: ['TAGARA', 'VALERIAN'],
    botanicalName: 'Valeriana wallichii DC.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 191'
  },
  {
    commonNames: ['GOTU KOLA', 'MANDUKAPARNI'],
    botanicalName: 'Centella asiatica (L.) Urb.',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol IV, Page 72'
  },
  {
    commonNames: ['KUTH', 'KUSTHA'],
    botanicalName: 'Saussurea lappa (Decne.) Sch.Bip.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 76'
  },
  {
    commonNames: ['SARPAGANDHA', 'RAUVOLFIA'],
    botanicalName: 'Rauvolfia serpentina (L.) Benth. ex Kurz',
    partUsed: 'Root (Mool)',
    category: 'Schedule E1',
    isScheduleE1: true,
    monographRef: 'API Part I, Vol I, Page 99'
  },
  {
    commonNames: ['BHUMI AMLA', 'BHUMYAMALAKI'],
    botanicalName: 'Phyllanthus niruri L.',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol I, Page 111'
  },
  {
    commonNames: ['ASHOKA', 'ASOKA', 'ASHOKA CHHAL'],
    botanicalName: 'Saraca asoca (Roxb.) Willd.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 17'
  },
  {
    commonNames: ['LODHRA', 'LODH'],
    botanicalName: 'Symplocos racemosa Roxb.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 82'
  },
  {
    commonNames: ['KUMARI', 'ALOE VERA', 'GHRITAKUMARI'],
    botanicalName: 'Aloe barbadensis Miller',
    partUsed: 'Leaf (Patra)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol I, Page 63'
  },
  {
    commonNames: ['SHUDDHA PARADA', 'PARADA', 'MERCURY'],
    botanicalName: 'Purified Elemental Mercury (Hg)',
    partUsed: 'Bhasma / Mineral',
    category: 'Metallic/Mineral',
    monographRef: 'AFI Part I, Rasa Shastra Monograph 1'
  },
  {
    commonNames: ['SHUDDHA GANDHAKA', 'GANDHAKA', 'SULFUR'],
    botanicalName: 'Purified Elemental Sulfur (S)',
    partUsed: 'Bhasma / Mineral',
    category: 'Metallic/Mineral',
    monographRef: 'AFI Part I, Rasa Shastra Monograph 2'
  },
  {
    commonNames: ['SHUDDHA ABHRAKA', 'ABHRAKA BHASMA'],
    botanicalName: 'Purified Biotite Mica',
    partUsed: 'Bhasma / Mineral',
    category: 'Metallic/Mineral',
    monographRef: 'AFI Part I, Rasa Shastra Monograph 5'
  },
  {
    commonNames: ['SHUDDHA SHILAJIT', 'SHILAJIT'],
    botanicalName: 'Asphaltum punjabianum (Purified Mineral Pitch)',
    partUsed: 'Bhasma / Mineral',
    category: 'Metallic/Mineral',
    monographRef: 'API Part I, Vol I, Page 101'
  },
  {
    commonNames: ['TIL OIL', 'TILA TAILA', 'TIL TAIL', 'SESAME OIL', 'GINGELLY OIL', 'TILA', 'TIL'],
    botanicalName: 'Sesamum indicum L.',
    partUsed: 'Seed (Beej) / Oil',
    category: 'Volatile Oil',
    monographRef: 'API Part I, Vol I, Page 115'
  },
  {
    commonNames: ['ERANDA TAILA', 'CASTOR OIL', 'ARANDI OIL', 'ERAND TAIL'],
    botanicalName: 'Ricinus communis L.',
    partUsed: 'Seed (Beej) / Oil',
    category: 'Volatile Oil',
    monographRef: 'API Part I, Vol I, Page 35'
  },
  {
    commonNames: ['SARSHAPA TAILA', 'MUSTARD OIL', 'SARSON OIL', 'SARSON TAIL'],
    botanicalName: 'Brassica juncea (L.) Czern.',
    partUsed: 'Seed (Beej) / Oil',
    category: 'Volatile Oil',
    monographRef: 'API Part I, Vol I, Page 98'
  },
  {
    commonNames: ['NARIKELA TAILA', 'COCONUT OIL', 'NARIYAL OIL'],
    botanicalName: 'Cocos nucifera L.',
    partUsed: 'Fruit (Phala) / Oil',
    category: 'Volatile Oil',
    monographRef: 'API Part I, Vol II, Page 129'
  },
  {
    commonNames: ['PURE HONEY', 'HONEY', 'MADHU', 'SHUDDHA MADHU'],
    botanicalName: 'Apis mellifera L. (Purified Honey)',
    partUsed: 'Kashaya / Extract',
    category: 'Animal Source',
    monographRef: 'API Part I, Vol I, Page 85'
  },
  {
    commonNames: ['COW GHEE', 'GHEE', 'GHRITA', 'GO GHRITA'],
    botanicalName: 'Clarified Cow Butter (Go Ghrita)',
    partUsed: 'Bhasma / Mineral',
    category: 'Animal Source',
    monographRef: 'API Part I, Vol I, Page 37'
  }
];

export function lookupAyurvedicHerb(inputName: string): HerbDictionaryEntry | null {
  if (!inputName || !inputName.trim()) return null;
  const cleanInput = inputName.trim().toUpperCase();

  // 1. Exact or substring match against common names
  for (const entry of AYURVEDIC_HERB_DICTIONARY) {
    for (const cn of entry.commonNames) {
      if (cleanInput === cn || cleanInput.includes(cn) || cn.includes(cleanInput)) {
        if (cleanInput.length >= 3 && (cn.includes(cleanInput) || cleanInput.includes(cn))) {
          return entry;
        }
      }
    }
  }

  // 2. Word token match
  const inputWords = cleanInput.split(/\s+/).filter(w => w.length >= 3);
  for (const word of inputWords) {
    for (const entry of AYURVEDIC_HERB_DICTIONARY) {
      for (const cn of entry.commonNames) {
        if (cn === word || cn.startsWith(word) || word.startsWith(cn)) {
          return entry;
        }
      }
    }
  }

  return null;
}

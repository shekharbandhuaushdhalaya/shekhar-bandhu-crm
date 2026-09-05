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
    commonNames: ['HARITAKI', 'HARRA', 'HARAD', 'HARDH', 'HARR', 'HARAR', 'CHEBULIC MYROBALAN'],
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
  },
  {
    commonNames: ['DHATAKI', 'DHATAKI PUSHPA', 'DHATRI PUSHPA', 'WOODFORDIA', 'FIRE FLAME BUSH', 'DHATKI'],
    botanicalName: 'Woodfordia fruticosa (L.) Kurz',
    partUsed: 'Flower (Pushpa)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 32'
  },
  {
    commonNames: ['DRAKSHA', 'MUNAKKA', 'KISHMISH', 'RAISIN', 'GRAPES'],
    botanicalName: 'Vitis vinifera L.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 35'
  },
  {
    commonNames: ['MUSTA', 'MUSTAKA', 'NAGARMOTHA', 'NUT GRASS'],
    botanicalName: 'Cyperus rotundus L.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 129'
  },
  {
    commonNames: ['KATUKA', 'KUTKI', 'KUTAKI', 'PICRORHIZA'],
    botanicalName: 'Picrorhiza kurroa Royle ex Benth.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 85'
  },
  {
    commonNames: ['KARPURA', 'KAPOOR', 'CAMPHOR'],
    botanicalName: 'Cinnamomum camphora (L.) J.Presl',
    partUsed: 'Kashaya / Extract',
    category: 'Volatile Oil',
    monographRef: 'API Part I, Vol IV, Page 57'
  },
  {
    commonNames: ['MAIDA LAKDI', 'MAIDA LAKRI', 'MEDA LAKDI', 'MEDASAKA', 'MAIDA LAKDA', 'LITSEA', 'LITSEA GLUTINOSA'],
    botanicalName: 'Litsea glutinosa (Lour.) C.B.Rob.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol V, Page 112'
  },
  {
    commonNames: ['MAHUA', 'MADHUKA', 'MADHUKA PUSHPA', 'MAHUA FLOWER', 'MAHWA', 'BUTTER TREE', 'HONEY TREE'],
    botanicalName: 'Madhuca longifolia (J.Koenig ex L.) J.F.Macbr.',
    partUsed: 'Flower (Pushpa)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 102'
  },
  {
    commonNames: ['VARUNA', 'VARUN', 'VARUNA CHHAL', 'CRATAEVA', 'THREE LEAVED CAPER'],
    botanicalName: 'Crateva nurvala Buch.-Ham.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 120'
  },
  {
    commonNames: ['KANKOLA', 'KANKOL', 'CUBEB', 'TAILPEPPER', 'KANKOLA PHALA'],
    botanicalName: 'Piper cubeba L.f.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 58'
  },
  {
    commonNames: ['USHEERA', 'KHAS', 'KHAS KHAS', 'VETIVER', 'USHIR', 'USIR'],
    botanicalName: 'Vetiveria zizanioides (L.) Nash',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 219'
  },
  {
    commonNames: ['TALISPATRA', 'TALISPATRI', 'TALIS', 'HIMALAYAN SILVER FIR'],
    botanicalName: 'Abies webbiana Lindl.',
    partUsed: 'Leaf (Patra)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol IV, Page 119'
  },
  {
    commonNames: ['KALMEGH', 'KALMEGHA', 'BHUNIMBA', 'ANDROGRAPHIS', 'KING OF BITTERS', 'GREEN CHIRETTA'],
    botanicalName: 'Andrographis paniculata (Burm.f.) Nees',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 61'
  },
  {
    commonNames: ['VAJRAVALLI', 'ASTHISAMHARAKA', 'HADJOD', 'HAD JORA', 'BONE SETTER', 'CISSUS QUADRANGULARIS'],
    botanicalName: 'Cissus quadrangularis L.',
    partUsed: 'Stem (Kanda)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 21'
  },
  {
    commonNames: ['BILVA', 'BAEL', 'SRIPHAL', 'BAEL FRUIT', 'GOLDEN APPLE', 'BEL'],
    botanicalName: 'Aegle marmelos (L.) Correa',
    partUsed: 'Unripe Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 27'
  },
  {
    commonNames: ['KHADIRA', 'BLACK CATECHU', 'CUTCH TREE', 'KATHA'],
    botanicalName: 'Acacia catechu (L.f.) Willd.',
    partUsed: 'Bark / Heartwood (Twak/Niryasa)',
    category: 'Plant Concentrate',
    monographRef: 'API Part I, Vol I, Page 69'
  },
  {
    commonNames: ['VACHA', 'SWEET FLAG', 'BACH', 'UGRAGANDHA'],
    botanicalName: 'Acorus calamus L.',
    partUsed: 'Rhizome (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 169'
  },
  {
    commonNames: ['ARAGVADHA', 'GOLDEN SHOWER', 'AMALTAS', 'KRITAMALA'],
    botanicalName: 'Cassia fistula L.',
    partUsed: 'Fruit Pod Pulp (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 11'
  },
  {
    commonNames: ['NIRGUNDI', 'FIVE LEAVED CHASTE TREE', 'SAMBHALU', 'SINDUVARA'],
    botanicalName: 'Vitex negundo L.',
    partUsed: 'Leaf (Patra)',
    category: 'Fresh Herb',
    monographRef: 'API Part I, Vol III, Page 143'
  },
  {
    commonNames: ['APAMARGA', 'PRICKLY CHAFF FLOWER', 'CHIRCHITA', 'LATJIRA'],
    botanicalName: 'Achyranthes aspera L.',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 7'
  },
  {
    commonNames: ['YAVANI', 'AJWAIN', 'CAROM SEEDS', 'BISHOP WEED'],
    botanicalName: 'Trachyspermum ammi (L.) Sprague',
    partUsed: 'Fruit (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 125'
  },
  {
    commonNames: ['DHANIYAKA', 'DHANIA', 'CORIANDER', 'KUSTUMBURU'],
    botanicalName: 'Coriandrum sativum L.',
    partUsed: 'Fruit (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 30'
  },
  {
    commonNames: ['JIRAKA', 'JEERA', 'CUMIN', 'SHWETA JIRA'],
    botanicalName: 'Cuminum cyminum L.',
    partUsed: 'Fruit (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 55'
  },
  {
    commonNames: ['MISREYA', 'SAUNF', 'FENNEL', 'MADHURIKA'],
    botanicalName: 'Foeniculum vulgare Mill.',
    partUsed: 'Fruit (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 81'
  },
  {
    commonNames: ['METHI', 'FENUGREEK', 'METHIKA'],
    botanicalName: 'Trigonella foenum-graecum L.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 109'
  },
  {
    commonNames: ['RASNA', 'RAYASAN', 'PLUCHEA'],
    botanicalName: 'Pluchea lanceolata (DC.) Oliv. & Hiern',
    partUsed: 'Leaf / Root (Patra)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 161'
  },
  {
    commonNames: ['SHALAPARNI', 'SARIVAN', 'DESMODIUM'],
    botanicalName: 'Desmodium gangeticum (L.) DC.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 179'
  },
  {
    commonNames: ['PRISHNIPARNI', 'PITHVAN', 'URARIA'],
    botanicalName: 'Uraria picta (Jacq.) DC.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 153'
  },
  {
    commonNames: ['KANTAKARI', 'CHHOTI KATERI', 'YELLOW BERRIED NIGHTSHADE'],
    botanicalName: 'Solanum surattense Burm.f.',
    partUsed: 'Whole Plant (Panchang)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 59'
  },
  {
    commonNames: ['GAMBHARI', 'KASHMARI', 'COOMB TEAK'],
    botanicalName: 'Gmelina arborea Roxb.',
    partUsed: 'Bark / Fruit (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 47'
  },
  {
    commonNames: ['SHYONAKA', 'SONAPATHA', 'ARLU'],
    botanicalName: 'Oroxylum indicum (L.) Kurz',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 187'
  },
  {
    commonNames: ['PATALA', 'PADAL', 'STEREOSPERMUM'],
    botanicalName: 'Stereospermum suaveolens (Roxb.) DC.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 149'
  },
  {
    commonNames: ['TRIVRIT', 'NISHOTH', 'TURPETH'],
    botanicalName: 'Operculina turpethum (L.) Silva Manso',
    partUsed: 'Root Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 161'
  },
  {
    commonNames: ['KULATTHA', 'HORSE GRAM', 'KULTHI'],
    botanicalName: 'Macrotyloma uniflorum (Lam.) Verdc.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 65'
  },
  {
    commonNames: ['AKARKARA', 'PELLITORY', 'AKARAKARABHA'],
    botanicalName: 'Anacyclus pyrethrum (L.) Lag.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 1'
  },
  {
    commonNames: ['AGNIMANTHA', 'ARANI', 'PREMNA', 'TARKARI'],
    botanicalName: 'Premna integrifolia L.',
    partUsed: 'Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 3'
  },
  {
    commonNames: ['SAFED MUSLI', 'WHITE MUSLI', 'SWETHA MUSLI'],
    botanicalName: 'Chlorophytum borivilianum Santapau',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol VI, Page 145'
  },
  {
    commonNames: ['JYOTISHMATI', 'MALKANGANI', 'INTELLECT TREE', 'STAFF TREE'],
    botanicalName: 'Celastrus paniculatus Willd.',
    partUsed: 'Seed / Oil (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 75'
  },
  {
    commonNames: ['KALONJI', 'BLACK SEED', 'UPAKUNCHIKA', 'BLACK CUMIN'],
    botanicalName: 'Nigella sativa L.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 57'
  },
  {
    commonNames: ['MAJUPHAL', 'OAK GALL', 'MANJAKANI', 'MAYAPHAL'],
    botanicalName: 'Quercus infectoria Olivier',
    partUsed: 'Gall (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 105'
  },
  {
    commonNames: ['JAMUN', 'JAMBU', 'JAVA PLUM', 'JAMUN SEED'],
    botanicalName: 'Syzygium cumini (L.) Skeels',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 55'
  },
  {
    commonNames: ['HING', 'ASAFOETIDA', 'HINGU', 'DEVIL DUNG'],
    botanicalName: 'Ferula foetida Regel',
    partUsed: 'Resin (Niryasa)',
    category: 'Plant Concentrate',
    monographRef: 'API Part I, Vol I, Page 51'
  },
  {
    commonNames: ['ALSI', 'FLAXSEED', 'LINSEED', 'ATASI'],
    botanicalName: 'Linum usitatissimum L.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 3'
  },
  {
    commonNames: ['KALI JEERI', 'KALIJIRI', 'SOMARAJI', 'BITTER CUMIN'],
    botanicalName: 'Centratherum anthelminticum (L.) Kuntze',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol III, Page 73'
  },
  {
    commonNames: ['ULATKAMBAL', 'DEVIL COTTON', 'PIVARI'],
    botanicalName: 'Abroma augusta (L.) L.f.',
    partUsed: 'Root Bark (Twak)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol V, Page 155'
  },
  {
    commonNames: ['PUTRAJEEVAK', 'PUTRANJIVA'],
    botanicalName: 'Putranjiva roxburghii Wall.',
    partUsed: 'Seed (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol V, Page 129'
  },
  {
    commonNames: ['CHIRONJI', 'CHAROLI', 'PRIYALA'],
    botanicalName: 'Buchanania lanzan Spreng.',
    partUsed: 'Seed Kernel (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol IV, Page 29'
  },
  {
    commonNames: ['GUNJA', 'ROSARY PEA', 'RATTI'],
    botanicalName: 'Abrus precatorius L.',
    partUsed: 'Seed (Beej)',
    category: 'Schedule E1',
    isScheduleE1: true,
    monographRef: 'API Part I, Vol I, Page 37'
  },
  {
    commonNames: ['KALIHARI', 'FLAME LILY', 'GLORIOSA', 'LANGALI'],
    botanicalName: 'Gloriosa superba L.',
    partUsed: 'Tuber (Mool)',
    category: 'Schedule E1',
    isScheduleE1: true,
    monographRef: 'API Part I, Vol II, Page 73'
  },
  {
    commonNames: ['LATAKARANJA', 'LATAKARANJ', 'KARANJU', 'FEVER NUT', 'BONDUC NUT', 'CAESALPINIA BONDUC'],
    botanicalName: 'Caesalpinia bonduc (L.) Roxb.',
    partUsed: 'Seed Kernel (Beej)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 71'
  },
  {
    commonNames: ['JIVANTI', 'JEEVANTI', 'LEPTADENIA', 'JEEVANI'],
    botanicalName: 'Leptadenia reticulata (Retz.) Wight & Arn.',
    partUsed: 'Root (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 43'
  },
  {
    commonNames: ['PASHANABHEDA', 'PAHANBHED', 'BERGENIA', 'ROCK FOIL', 'SAXIFRAGA'],
    botanicalName: 'Bergenia ligulata (Wall.) Engl.',
    partUsed: 'Rhizome (Mool)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 89'
  },
  {
    commonNames: ['KAMPILLAKA', 'KABILA', 'MALLOTUS', 'ROHINI', 'KAMALA POWDER'],
    botanicalName: 'Mallotus philippensis (Lam.) Müll.Arg.',
    partUsed: 'Fruit Powder (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol I, Page 53'
  },
  {
    commonNames: ['MADANAPHALA', 'MAINPHAL', 'RANDIA', 'EMETIC NUT'],
    botanicalName: 'Randia dumetorum Lam.',
    partUsed: 'Fruit (Phala)',
    category: 'Dry Herb',
    monographRef: 'API Part I, Vol II, Page 89'
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

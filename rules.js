// 주제, 분류 규칙, OpenAlex 질의. 사이트(app.js)와 시드 생성 스크립트가 같이 쓴다.
(function (root) {
  'use strict';

  // 지분 기본값. mine이 붙은 주제가 내 연구 분야다.
  const TOPICS = [
    { id: 'ai', name: 'AI 포렌식 신뢰성', base: 5, mine: true },
    { id: 'anti', name: '안티포렌식·완전삭제', base: 4, mine: true },
    { id: 'leak', name: '기술유출·내부자', base: 4, mine: true },
    { id: 'law', name: '증거법·증거개시', base: 3, mine: true },
    { id: 'win', name: '윈도우·파일시스템', base: 3, mine: true },
    { id: 'gen', name: '방법론·일반', base: 2 },
    { id: 'mem', name: '메모리', base: 1 },
    { id: 'mobile', name: '모바일', base: 1 },
    { id: 'cloud', name: '클라우드·IoT', base: 1 },
    { id: 'net', name: '네트워크·침해사고', base: 1 },
    { id: 'media', name: '멀티미디어·딥페이크', base: 1 },
    { id: 'chain', name: '블록체인', base: 1 },
  ];

  // 제목을 먼저 보고, 안 걸리면 초록까지 본다. 위에 있는 규칙이 우선한다.
  const RULES = [
    ['anti', /anti-?forensic|counter-?forensic|\bwip(e|es|ed|ing)\b|secure(ly)? delet|data sanitiz|file delet|deleted (file|data)|timestomp|data hiding/i],
    ['leak', /insider|exfiltrat|data leak|information leak|trade secret|intellectual property|data theft|data breach/i],
    ['ai', /large language model|\bLLMs?\b|chatgpt|\bGPT\b|generative ai|explainab|\bXAI\b|trustworth|agentic|ai[- ](assisted|driven|based|enabled|powered|enhanced)/i],
    ['law', /admissib|chain of custody|\bcourts?\b|legal|judicial|e-?discovery|expert witness|\blaw\b|jurisdiction|fair trial|evidence (management|handling)/i],
    ['win', /windows|ntfs|registry|prefetch|event logs?|usn journal|\$mft|shellbag|jump list|amcache|file ?systems?|ext4|apfs|\bssd\b|storage media/i],
    ['mem', /memory forensic|volatile memory|memory dump|memory acquisition|memory analysis|\bRAM\b/i],
    ['mobile', /android|\bios\b|iphone|smartphone|mobile|whatsapp|telegram|wechat|messenger/i],
    ['media', /deepfake|forger|multimedia|audio|camera|steganalysis|image|video|synthetic media|watermark|\bface\b/i],
    ['chain', /blockchain|cryptocurrenc|bitcoin|ethereum|smart contract|crypto wallet/i],
    ['cloud', /cloud|\biot\b|internet of things|drone|\buav\b|vehicle|automotive|smart home|wearable|container|kubernetes/i],
    ['net', /network|intrusion|malware|ransomware|incident response|packet|traffic|\bAPT\b|threat|attack|log analysis/i],
    ['ai', /artificial intelligence|machine learning|deep learning|neural/i],
  ];
  const NOT_DIGITAL = /cadaver|post.?mortem|autops|\bdna\b|toxicolog|\bdrugs?\b|cocaine|ketamine|blood|skelet|genealog|entomolog|decompos|firearm|fingermark|latent print|medico-?legal|suicide|patholog|semen|saliva|vagina|residue|bruis|injur|trauma|microbial|odontolog|anthropolog|explosive|\bsoil\b|handwriting|psychiatr|forensic audit|linguistic/i;
  const TITLE_SIGNAL = /forensic|digital evidence|investigat|incident|artifact|artefact|deepfake|tamper|forger|provenance|insider|exfiltrat|trade secret|custody|cybercrime|malware|ransomware/i;
  const ABS_SIGNAL = /digital forensic|digital evidence|digital investigation|computer forensic|anti-?forensic|forensic (investigator|examiner|practitioner|tool|artifact|artefact|readiness|triage)/i;

  const ANCHOR = '("digital forensics" OR "digital forensic" OR "digital evidence" OR "digital investigation" OR "computer forensics" OR "anti-forensics" OR "anti-forensic" OR "memory forensics" OR "mobile forensics" OR "network forensics" OR "cloud forensics")';
  const FIELD = '("large language model" OR "large language models" OR LLM OR "generative AI" OR explainable OR trustworthy OR "anti-forensic" OR "anti-forensics" OR wiping OR "secure deletion" OR "file deletion" OR insider OR exfiltration OR "data leakage" OR "trade secret" OR admissibility OR "chain of custody" OR "Windows 11" OR NTFS OR registry)';
  // 기술유출 연구는 '디지털포렌식'이라는 말을 잘 쓰지 않아서 따로 묻는다
  const LEAK = '("insider threat" OR "insider threats" OR "data exfiltration" OR "trade secret" OR "intellectual property theft") AND (forensic OR forensics OR investigation OR detection)';

  // [검색식, 며칠 전부터, 한 번에 몇 편]
  const JOBS = [[`${ANCHOR} AND ${FIELD}`, -540, 200], [ANCHOR, -200, 200], [LEAK, -540, 50]];
  const SELECT = 'id,doi,title,publication_date,cited_by_count,authorships,primary_location,open_access,abstract_inverted_index';
  const ABS_MAX = 2400;

  // 동향 패널에서 세는 주제어
  const TRENDS = [
    ['LLM', /large language model|\bLLMs?\b|chatgpt|\bGPT\b/i],
    ['에이전트 AI', /agentic|ai agents?|autonomous agents?/i],
    ['생성형 AI', /generative ai|genai|diffusion model/i],
    ['설명 가능한 AI', /explainab|\bXAI\b/i],
    ['프롬프트 인젝션', /prompt injection/i],
    ['딥페이크', /deepfake/i],
    ['워터마크·출처 증명', /watermark|provenance|c2pa/i],
    ['안티포렌식', /anti-?forensic/i],
    ['랜섬웨어', /ransomware/i],
    ['내부자 위협', /insider/i],
    ['증거 보관 연속성', /chain of custody/i],
    ['증거능력', /admissib/i],
    ['벤치마크·데이터셋', /benchmark|dataset/i],
    ['트리아지', /triage/i],
    ['타임라인 분석', /timeline/i],
    ['Windows', /windows/i],
    ['안드로이드', /android/i],
    ['메신저', /whatsapp|telegram|wechat|messenger/i],
    ['메모리 포렌식', /memory forensic|volatile memory/i],
    ['클라우드', /cloud/i],
    ['IoT', /\biot\b|internet of things/i],
    ['블록체인', /blockchain/i],
    ['드론', /drone|\buav\b/i],
    ['차량', /vehicle|automotive/i],
  ];
  // 논문이 걸리는 주제어 번호들. 시드에는 초록 원문을 싣지 않아서 미리 계산해 둔다.
  function trendsOf(p) {
    const text = p.title + ' ' + (p.abs || '');
    return TRENDS.map(([, re], i) => (re.test(text) ? i : -1)).filter(i => i >= 0);
  }

  function classify(p) {
    for (const [id, re] of RULES) if (re.test(p.title)) return id;
    const all = p.title + ' ' + (p.abs || '');
    for (const [id, re] of RULES) {
      if (!re.test(all)) continue;
      // 초록에 한 번 스치듯 나온 '내부자'만으로는 기술유출 주제로 보지 않는다
      if (id === 'leak' && (all.match(new RegExp(re.source, 'gi')) || []).length < 2) continue;
      return id;
    }
    return 'gen';
  }
  function relevant(p) {
    if (!p.title || NOT_DIGITAL.test(p.title)) return false;
    return TITLE_SIGNAL.test(p.title) || ABS_SIGNAL.test(p.abs || '');
  }
  // OpenAlex 응답 한 건을 사이트가 쓰는 작은 모양으로 줄인다
  function compact(w) {
    const src = w.primary_location && w.primary_location.source;
    const inv = w.abstract_inverted_index;
    let abs = '';
    if (inv) {
      const words = [];
      for (const k in inv) for (const pos of inv[k]) words[pos] = k;
      abs = words.join(' ').replace(/\s+/g, ' ').trim().replace(/^abstract:?\s*/i, '').slice(0, ABS_MAX);
    }
    return {
      id: String(w.id).replace('https://openalex.org/', ''),
      doi: w.doi ? String(w.doi).replace('https://doi.org/', '') : null,
      title: String(w.title || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
      date: w.publication_date || null,
      cites: w.cited_by_count || 0,
      authors: (w.authorships || []).slice(0, 3).map(a => a.author && a.author.display_name).filter(Boolean),
      aids: (w.authorships || []).slice(0, 3).filter(a => a.author && a.author.display_name).map(a => String(a.author.id || '').replace('https://openalex.org/', '')),
      nAuthors: (w.authorships || []).length,
      venue: src ? src.display_name : null,
      oa: !!(w.open_access && w.open_access.is_oa),
      url: (w.primary_location && w.primary_location.landing_page_url) || w.doi || w.id,
      abs,
    };
  }

  root.STL = { TOPICS, TRENDS, JOBS, SELECT, ABS_MAX, classify, relevant, compact, trendsOf };
})(typeof window !== 'undefined' ? window : globalThis);

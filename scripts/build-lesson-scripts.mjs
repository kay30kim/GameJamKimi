import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "content/lesson-scripts");
const topics = ["kindness", "empathy", "sharing", "honesty", "patience", "bravery", "gratitude", "teamwork", "body_safety", "table_manners"];
const ages = [3, 4, 5, 6];
const languages = ["ko", "en"];
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const normalize = (text) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const localized = (ko, en, tag = "span", attrs = "") => `<${tag} data-ko="${escape(ko)}" data-en="${escape(en)}" ${attrs}>${escape(ko)}</${tag}>`;

function requireText(text, location) {
  assert.equal(typeof text, "string", `${location} must be text`);
  assert(text.trim().length > 0, `${location} must not be empty`);
  assert(!/\b(?:TODO|TBD|PLACEHOLDER)\b/.test(text), `${location} contains a placeholder`);
}

function validate(topic) {
  assert(topics.includes(topic.id), `Unknown topic ${topic.id}`);
  assert.equal(topic.order, topics.indexOf(topic.id) + 1, `${topic.id}: order`);
  languages.forEach((language) => requireText(topic.names[language], `${topic.id}.names.${language}`));
  assert.equal(topic.versions.length, 8, `${topic.id}: need four ages in both languages`);
  const keys = new Set();
  const texts = { ko: new Set(), en: new Set() };
  for (const version of topic.versions) {
    const key = `${topic.id}/${version.language}/${version.age}`;
    assert(ages.includes(version.age) && languages.includes(version.language), `${key}: invalid audience`);
    assert(!keys.has(key), `${key}: duplicate version`);
    keys.add(key);
    for (const field of ["title", "goal", "phrase", "meaning", "setting", "caregiverNote"]) requireText(version[field], `${key}.${field}`);
    assert(Array.isArray(version.cast) && version.cast.length > 1, `${key}: cast`);
    assert.equal(version.scenes.length, 4, `${key}: four scenes required`);
    let dialogue = "";
    const readLines = (lines, location) => {
      assert(Array.isArray(lines) && lines.length > 0, `${location}: missing dialogue`);
      for (const line of lines) {
        requireText(line.speaker, `${location}.speaker`);
        requireText(line.text, `${location}.text`);
        assert(version.cast.some((actor) => line.speaker.startsWith(actor)), `${location}: speaker ${line.speaker} not in cast`);
        dialogue += line.text + "\n";
      }
    };
    version.scenes.forEach((scene, index) => {
      const location = `${key}/scene${index + 1}`;
      for (const field of ["title", "narration", "action"]) requireText(scene[field], `${location}.${field}`);
      if (index === 2) {
        assert.equal(scene.choices?.length, 2, `${location}: two full choice outcomes required`);
        assert.notEqual(scene.choices[0].label, scene.choices[1].label, `${location}: choices must differ`);
        if (scene.lines?.length) readLines(scene.lines, location);
        for (const [choiceIndex, choice] of scene.choices.entries()) {
          const choiceLocation = `${location}/${choiceIndex ? "B" : "A"}`;
          for (const field of ["label", "narration", "action"]) requireText(choice[field], `${choiceLocation}.${field}`);
          readLines(choice.lines, choiceLocation);
        }
      } else {
        assert(!scene.choices?.length, `${location}: put the two branching outcomes in scene 3`);
        readLines(scene.lines, location);
      }
    });
    for (const field of ["phrase", "meaning"]) {
      assert(normalize(dialogue).includes(normalize(version[field])), `${key}: ${field} absent from spoken dialogue`);
    }
    const teaching = version.scenes[1].lines.map((line) => line.text).join(" ");
    assert(version.language === "ko" ? /영어로/.test(teaching) : /means|meaning|in English/i.test(teaching), `${key}: explain the phrase's meaning explicitly`);
    assert(version.scenes[3].lines.some((line) => /앨리스|Alice/.test(line.speaker) && /해\s?볼(?:까|래)|말해\s?볼|같이.*말|함께.*말|(?:say|try).*(?:with me|together)|(?:shall we|want to|would you like to) (?:say|try)/i.test(line.text)), `${key}: Alice's practice invitation must follow the choice outcomes`);
    requireText(version.recall?.prompt, `${key}.recall.prompt`);
    requireText(version.recall?.example, `${key}.recall.example`);
    assert(!texts[version.language].has(dialogue), `${key}: identical script reused for another age`);
    texts[version.language].add(dialogue);
  }
}

const data = await Promise.all(topics.map(async (id) => {
  const topic = JSON.parse(await readFile(path.join(source, `${id}.json`), "utf8"));
  assert.equal(topic.id, id);
  validate(topic);
  return topic;
}));
const css = await readFile(path.join(source, "review.css"), "utf8");

function story(topic, version) {
  const ko = version.language === "ko";
  const t = (korean, english) => ko ? korean : english;
  const id = `${version.language}-${version.age}-${topic.id}`;
  const lines = (items = []) => `<div class="dialogue">${items.map((line) => `<p><strong>${escape(line.speaker)}</strong><span>${escape(line.text)}</span></p>`).join("\n")}</div>`;
  const action = (text) => `<p class="direction"><b>${t("행동 · 촬영 지시", "Action · shot direction")}</b>${escape(text)}</p>`;
  const camera = t("모든 대사: 지금 말하는 캐릭터의 가슴 위 정면 또는 약한 3/4 숏. 양쪽 눈·코·입을 모두 보이게 하고, 말이 끝날 때까지 유지해요. 다른 캐릭터나 소품이 얼굴을 가리지 않아요.", "Every line: frame the current speaker from the chest up, front-on or at a slight three-quarter angle. Keep both eyes, nose, and mouth visible throughout the line, without another character or prop covering the face.");
  return `<article class="story" id="${id}" data-topic="${topic.id}" data-age="${version.age}" lang="${version.language}"${id === "ko-3-kindness" ? "" : " hidden"} aria-labelledby="${id}-title">
<header class="story-header"><p class="eyebrow">${String(topic.order).padStart(2, "0")} / 10 · ${escape(topic.names[version.language])} · ${t(`${version.age}세`, `Age ${version.age}`)}</p><h2 id="${id}-title" tabindex="-1">${escape(version.title)}</h2><p class="story-subtitle">${t("한국어 중심 · 영어 표현의 뜻을 함께 배워요", "English first · Korean expressions explained in English")} · ${t("4장면 + 선택의 두 결과", "4 scenes + both choice outcomes")}</p></header>
<dl class="overview"><div><dt>${t("오늘의 표현", "Today's expression")}</dt><dd lang="${version.language}">${escape(version.phrase)}</dd><dd class="translation" lang="${ko ? "en" : "ko"}">${escape(version.meaning)}</dd></div><div><dt>${t("등장인물", "Cast")}</dt><dd>${escape(version.cast.join(" · "))}</dd></div><div><dt>${t("소품 · 장소", "Props · setting")}</dt><dd>${escape(version.setting)}</dd></div></dl>
<p class="learning-goal"><b>${t(`${version.age}세에서 연습할 것`, `What to practice at age ${version.age}`)}</b>${escape(version.goal)}</p>
<p class="age-note"><b>${t("함께 읽는 어른에게", "For the grown-up reading along")}</b>${escape(version.caregiverNote)}</p>
<div class="scenes">${version.scenes.map((scene, i) => `<section class="scene" aria-labelledby="${id}-scene-${i + 1}"><div class="scene-number" aria-hidden="true">0${i + 1}</div><div class="scene-body"><h3 id="${id}-scene-${i + 1}">${escape(scene.title)}</h3><p class="narration"><b>${t("해설", "Narration")}</b>${escape(scene.narration)}</p>${action(scene.action)}<p class="camera-note"><b>${t("화자의 얼굴", "Speaker's face")}</b> ${camera}</p>${lines(scene.lines)}${scene.choices ? `<div class="branches">${scene.choices.map((choice, j) => `<section class="branch" aria-label="${j ? "B" : "A"} · ${escape(choice.label)}"><h4><span class="branch-letter">${j ? "B" : "A"}</span>${escape(choice.label)}</h4><p class="narration">${escape(choice.narration)}</p>${action(choice.action)}${lines(choice.lines)}</section>`).join("\n")}</div>` : ""}</div></section>`).join("\n")}</div>
<section class="recall"><h3>${t("다른 상황에서 써 보기", "Try it in a new situation")}</h3><p>${escape(version.recall.prompt)}</p><details><summary>${t("말하기 예시 보기", "Show an example response")}</summary><p>${escape(version.recall.example)}</p></details><small>${t("정답을 검사하지 않아요. 잠깐 기다려 주고, 듣기만 하거나 손짓으로 답해도 괜찮아요.", "Give the child time. Listening or using a gesture is welcome; this is not a test.")}</small></section>
<footer class="story-footer">${t("선택 후에는 그 선택의 결과부터 이어집니다. 해설과 대사만 읽고, 행동·촬영 지시는 읽지 않아요.", "Continue with the chosen outcome. Read narration and dialogue aloud; action and camera notes are for production only.")}</footer></article>`;
}

const html = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>앨리스의 나이별 대본 · Age-specific story scripts</title><style>${css}</style></head>
<body data-language="ko" data-age="3"><a class="skip-link" href="#stories" data-ko="대본으로 바로 가기" data-en="Skip to the scripts">대본으로 바로 가기</a><div class="shell">
<nav class="masthead"><span class="brand"><span class="brand-mark" aria-hidden="true">A</span>Alicetales · Story notebook</span><span class="draft-tag">${localized("나이별 대본 초안", "Age-specific script drafts")}</span></nav>
<header class="hero"><div>${localized("상황을 보고, 뜻을 알고, 내 말로 해 보기", "See it, understand it, and try it", "p", 'class="eyebrow"')}${localized("나이에 맞게, 마음이 전해지게", "Words that grow with your child", "h1")}${localized("3·4·5·6세마다 다른 대사와 말하기 연습. 선택이 친구의 마음에 어떤 변화를 주는지 보고, 두 언어의 표현이 어떤 뜻인지 알아봐요.", "Different dialogue and practice for ages 3, 4, 5, and 6. See how choices affect a friend's feelings, learn what an expression means in both languages, and try using it.", "p", 'class="lead"')}</div><aside class="count-card"><strong>80</strong>${localized("10개 주제 × 4개 나이 × 2개 언어", "10 topics × 4 ages × 2 languages", "p")}${localized("나이별로 따로 쓴 대사", "Dialogue written for each age", "p", 'class="mini-rule"')}</aside></header>
${localized("검토용 초안입니다. 이 페이지의 대본과 촬영 지침은 아직 게임의 고정 대본·카메라 동작에 연결하지 않았습니다.", "Drafts for review. These scripts and shot directions are not yet connected to fixed story playback or camera behavior in the game.", "p", 'class="review-note"')}
<details class="reading-guide"><summary>${localized("나이별 차이와 촬영 원칙", "Age differences and camera directions")}</summary><div class="age-guide">${[
  ["3세 · 짧은 한마디, 눈앞의 행동, 기분 이름", "Age 3 · one short phrase, a concrete action, a feeling"],
  ["4세 · 짧은 문장, 부탁과 대답, 전후 기분", "Age 4 · short sentences, a request and reply, feelings before and after"],
  ["5세 · 행동과 감정의 이유, 표현을 다시 써 보기", "Age 5 · why an action changes feelings, using the phrase again"],
  ["6세 · 서로 다른 입장, 배운 말을 새 상황에 쓰기", "Age 6 · different perspectives, transferring a phrase to a new situation"],
].map(([ko, en]) => localized(ko, en, "p")).join("\n")}</div>${localized("화자가 바뀌면 발화 전에 그 캐릭터의 얼굴로 잡아요. 정면 또는 약한 3/4 각도에서 양쪽 눈·코·입이 모두 보여야 해요. 뒤돌아 걷기·회전은 말하기 전에 끝내거나 대사 뒤로 옮기고, 소품이나 상대가 얼굴을 가리지 않아요.", "Before each line, frame the new speaker's face. Show both eyes, nose, and mouth from the front or a slight three-quarter angle. Finish turns or walking away before speech, or move them after it. Keep props and other characters out of the face.", "p")}${localized("친절에서는 도움을 놓쳤을 때의 속상함과 다시 도울 기회를 보여 줘요. 몸의 경계, 원치 않는 접촉, 먹지 않기, 쉬고 지켜보기는 잘못된 선택으로 다루지 않아요.", "Kindness shows disappointment when help is missed and a chance to repair it. Bodily boundaries, declining touch or food, and choosing to rest or watch are never treated as wrong choices.", "p")}</details>
<section class="controls" aria-label="Script selection"><fieldset class="language-control"><legend>${localized("대사의 중심 언어", "Main dialogue language")}</legend><div class="language-switch"><button type="button" data-language="ko" aria-pressed="true" lang="ko">한국어 중심</button><button type="button" data-language="en" aria-pressed="false" lang="en">English first</button></div></fieldset><fieldset><legend>${localized("아이의 나이", "Child's age")}</legend><div class="language-switch age-switch">${ages.map((age) => `<button type="button" data-age="${age}" aria-pressed="${age === 3}" data-ko="${age}세" data-en="Age ${age}">${age}세</button>`).join("")}</div></fieldset><div><label class="control-label" for="topic">${localized("읽을 이야기", "Choose a story")}</label><select id="topic">${data.map((topic) => `<option value="${topic.id}" data-ko="${String(topic.order).padStart(2, "0")} · ${escape(topic.names.ko)}" data-en="${String(topic.order).padStart(2, "0")} · ${escape(topic.names.en)}">${String(topic.order).padStart(2, "0")} · ${escape(topic.names.ko)}</option>`).join("")}<option value="all" data-ko="전체 10개 이야기" data-en="All 10 stories">전체 10개 이야기</option></select></div><div class="view-controls"><label class="compare-label"><input id="compare" type="checkbox">${localized("나이별 비교", "Compare all ages")}</label><button type="button" class="print-button" id="print" data-ko="현재 대본 인쇄" data-en="Print this view">현재 대본 인쇄</button></div></section>
<div class="position-bar"><span id="position" role="status" aria-live="polite"></span><div class="page-turns"><button type="button" id="previous" data-ko="← 이전" data-en="← Previous">← 이전</button><button type="button" id="next" data-ko="다음 →" data-en="Next →">다음 →</button></div></div>
<noscript><p class="noscript-note">한국어 3세 친절 대본입니다. 나이·언어·주제를 바꾸려면 JavaScript를 켜 주세요. Enable JavaScript to choose another age, language, or topic.</p></noscript>
<main id="stories">${data.flatMap((topic) => ages.flatMap((age) => languages.map((language) => story(topic, topic.versions.find((version) => version.age === age && version.language === language))))).join("\n")}</main>
<footer class="site-footer"><p>Alicetales · ${localized("나이별 언어 학습 대본", "Age-specific language-learning scripts")}</p><p>${localized("듣고, 뜻을 알고, 함께 말해요.", "Listen, understand, and say it together.")}</p></footer></div>
<script>
(() => {
  const ids = ${JSON.stringify(topics)};
  const topic = document.getElementById('topic');
  const compare = document.getElementById('compare');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  let language = 'ko';
  let age = 3;
  function fromHash() {
    const parts = location.hash.slice(1).split('-');
    if (!['ko', 'en'].includes(parts[0])) return;
    const legacy = parts.length === 2;
    const selectedTopic = parts[legacy ? 1 : 2];
    const selectedAge = legacy ? '3' : parts[1];
    if ((!ids.includes(selectedTopic) && selectedTopic !== 'all') || !['3','4','5','6','compare'].includes(selectedAge)) return;
    language = parts[0];
    compare.checked = selectedAge === 'compare';
    if (!compare.checked) age = Number(selectedAge);
    topic.value = selectedTopic;
  }
  function render(moveFocus = false) {
    document.documentElement.lang = language;
    document.body.dataset.language = language;
    document.body.dataset.age = String(age);
    document.querySelectorAll('[data-ko][data-en]').forEach(el => { el.textContent = el.dataset[language]; });
    document.querySelectorAll('button[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)));
    document.querySelectorAll('button[data-age]').forEach(button => button.setAttribute('aria-pressed', String(!compare.checked && Number(button.dataset.age) === age)));
    document.querySelectorAll('.story').forEach(article => {
      article.hidden = article.lang !== language || (!compare.checked && Number(article.dataset.age) !== age) || (topic.value !== 'all' && article.dataset.topic !== topic.value);
    });
    const index = ids.indexOf(topic.value);
    previous.disabled = index <= 0;
    next.disabled = index < 0 || index === ids.length - 1;
    const count = document.querySelectorAll('.story:not([hidden])').length;
    const audience = compare.checked ? (language === 'ko' ? '3·4·5·6세 비교' : 'Ages 3, 4, 5, 6 compared') : (language === 'ko' ? age + '세' : 'Age ' + age);
    document.getElementById('position').textContent = audience + ' · ' + (language === 'ko' ? '한국어 중심 · ' + count + '편' : 'English first · ' + count + (count === 1 ? ' script' : ' scripts'));
    const fragment = '#' + language + '-' + (compare.checked ? 'compare' : age) + '-' + topic.value;
    if (location.hash !== fragment) history.replaceState(null, '', fragment);
    if (moveFocus) document.querySelector('.story:not([hidden]) h2')?.focus({preventScroll: true});
  }
  document.querySelectorAll('button[data-language]').forEach(button => button.addEventListener('click', () => { language = button.dataset.language; render(); }));
  document.querySelectorAll('button[data-age]').forEach(button => button.addEventListener('click', () => { age = Number(button.dataset.age); compare.checked = false; render(); }));
  topic.addEventListener('change', () => render(true));
  compare.addEventListener('change', () => render());
  previous.addEventListener('click', () => { const index = ids.indexOf(topic.value); if (index > 0) { topic.value = ids[index - 1]; render(true); } });
  next.addEventListener('click', () => { const index = ids.indexOf(topic.value); if (index >= 0 && index < ids.length - 1) { topic.value = ids[index + 1]; render(true); } });
  document.getElementById('print').addEventListener('click', () => window.print());
  window.addEventListener('hashchange', () => { fromHash(); render(); });
  fromHash();
  render();
})();
</script></body></html>
`;
const output = path.join(root, "public/lesson-scripts.html");
if (process.argv.includes("--check")) {
  assert.equal(await readFile(output, "utf8"), html, "Review page is stale; run npm run scripts:build");
  console.log("Validated 80 scripts, 320 scenes, 160 choice outcomes; generated page is current.");
} else {
  await writeFile(output, html);
  console.log("Built public/lesson-scripts.html: 80 age-specific scripts, 320 scenes, 160 choice outcomes.");
}

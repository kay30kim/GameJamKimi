import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Review artifacts only. This exporter never updates the runtime or public site.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "artifacts/script-review");
const topicIds = ["kindness", "empathy", "sharing", "honesty", "patience", "bravery", "gratitude", "teamwork", "body_safety", "table_manners"];
const original = await Promise.all(topicIds.map(async (id) => JSON.parse(await readFile(path.join(root, `content/lesson-scripts/${id}.json`), "utf8"))));
const topics = structuredClone(original);
const editsPath = path.join(destination, "source/review-edits.json");
const edits = JSON.parse(await readFile(editsPath, "utf8").catch((error) => { if (error.code === "ENOENT") return "[]"; throw error; }));
const snapshot = JSON.parse(await readFile(path.join(destination, "source/generated-scenes.json"), "utf8"));

for (const edit of edits) {
  const topic = topics.find((item) => item.id === edit.topic);
  const version = topic?.versions.find((item) => item.age === edit.age && item.language === edit.language);
  assert(version, `Unknown review version: ${JSON.stringify(edit)}`);
  const parts = edit.path.split(".");
  let object = version;
  for (const key of parts.slice(0, -1)) object = object[key];
  const key = parts.at(-1);
  assert.equal(object[key], edit.before, `Review correction drift at ${edit.topic}/${edit.age}/${edit.language}/${edit.path}`);
  object[key] = edit.after;
}

const divider = "=".repeat(76);
const camera = "발화 전에 말하는 캐릭터의 정면 또는 약한 3/4 얼굴을 잡습니다. 대사 내내 양쪽 눈·코·입이 보여야 합니다. 회전·뒤돌아 걷기는 발화 전에 끝내거나 대사 뒤에 합니다. 소품이 얼굴을 가리지 않습니다.";
const idFor = (topic, version) => `${version.language.toUpperCase()}-${topic.id.toUpperCase()}-${version.age}`;
const lineText = (lines = []) => lines.map((line) => `  ${line.speaker}: ${line.text}`).join("\n");
const everyLine = (version) => version.scenes.flatMap((scene) => [...(scene.lines ?? []), ...(scene.choices ?? []).flatMap((choice) => choice.lines)]);

function renderVersion(topic, version) {
  assert.equal(version.scenes.length, 4);
  assert.equal(version.scenes[2].choices.length, 2);
  const id = idFor(topic, version);
  const normalized = (text) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const spoken = normalized(everyLine(version).map((line) => line.text).join(" "));
  assert(spoken.includes(normalized(version.phrase)), `Practice phrase not spoken: ${id}`);
  assert(spoken.includes(normalized(version.meaning)), `Translation not spoken: ${id}`);
  const sections = [
    divider, `[${id}] ${topic.names.ko} / ${version.age}세 / ${version.language === "ko" ? "한국어 중심" : "영어 중심"}`,
    `제목: ${version.title}`, "상태: 사용자 검수 전 제안 원고 — 게임에 아직 연결하지 않음", "",
    `연습할 말: ${version.phrase}`, `다른 언어의 같은 뜻: ${version.meaning}`,
    `학습 목표: ${version.goal}`, `등장인물: ${version.cast.join(", ")}`, `장소·소품: ${version.setting}`,
    `함께 읽는 어른에게: ${version.caregiverNote}`, `촬영 공통 원칙: ${camera}`,
    "선택 흐름: 1 → 2 → 3의 A 또는 B 하나 → 4. 선택 뒤 처음 장면으로 돌아가지 않습니다.",
    "읽는 범위: [해설]과 인물 대사만 음성으로 읽습니다. [행동·촬영]과 검토란은 제작 지시입니다.",
  ];
  version.scenes.forEach((scene, index) => {
    sections.push("", `--- 장면 ${index + 1}. ${scene.title} ---`, `[해설] ${scene.narration}`, `[행동·촬영] ${scene.action}`);
    if (scene.lines?.length) sections.push(lineText(scene.lines));
    for (const [choiceIndex, choice] of (scene.choices ?? []).entries()) {
      sections.push("", `[선택 ${choiceIndex ? "B" : "A"}] ${choice.label}`, `[선택 결과 해설] ${choice.narration}`, `[행동·촬영] ${choice.action}`, lineText(choice.lines), "[다음] 이 선택의 결과가 끝난 뒤 장면 4로 이어집니다.");
    }
  });
  sections.push("", "--- 다른 상황에서 써 보기 ---", `질문: ${version.recall.prompt}`, `말하기 예시: ${version.recall.example}`, "", `[${id} 검토란] 승인 / 수정 / 제외:`, "고칠 대사·표현:", "원하는 행동·선택 결과:", "");
  const text = sections.join("\n");
  for (const line of everyLine(version)) assert(text.includes(`${line.speaker}: ${line.text}`), `Missing dialogue in ${id}`);
  assert(text.includes(version.phrase) && text.includes(version.meaning));
  return text;
}

const items = topics.flatMap((topic) => [3, 4, 5, 6].flatMap((age) => ["ko", "en"].map((language) => {
  const version = topic.versions.find((item) => item.age === age && item.language === language);
  assert(version, `${topic.id}/${age}/${language} missing`);
  return { topic, version, id: idFor(topic, version), text: renderVersion(topic, version) };
})));
assert.equal(items.length, 80);
assert.equal(new Set(items.map((item) => item.id)).size, 80);

const header = (selection) => [
  "ALICETALES 전체 대본 검수 원고", `범위: ${selection.length}편 / ${selection.length * 4}개 장면 / 선택 결과 ${selection.length * 2}개`,
  "이 파일은 반영 전 원고입니다. 현재 게임에서 즉석 생성되는 대사 전체를 뜻하지 않습니다.",
  "실제 게임은 아직 AI로 새 장면을 생성합니다. 따라서 사전에 정해진 전체 대사가 없으며, 앞으로 생성될 문장을 전부 추출할 수는 없습니다.",
  `현재 클라우드에서 읽을 수 있는 생성 대본 ${snapshot.length}개는 04_현재_클라우드생성대본.txt에 원문 그대로 따로 담았습니다.`,
  "검수 원고 전체는 80편이며 이 파일에는 위 범위에 해당하는 원고를 담았습니다. 사용자 검수 후 고정 대본으로 연결하기 위한 제안입니다. 검수 중에는 운영 대본·음성·생성 규칙을 변경하지 않습니다.",
  "나이별 기준: 3세 짧은 말과 눈앞의 행동 / 4세 부탁과 대답 / 5세 행동과 감정의 이유 / 6세 서로의 입장과 새 상황에서 써 보기.",
  "말하기는 선택입니다. 몸의 접촉, 음식, 놀이를 거절한 선택을 나쁘다고 다루지 않습니다.",
  "", "목차 (대괄호 안 ID로 검색하면 해당 대본으로 이동할 수 있습니다)",
  ...selection.map(({ topic, version, id }) => `${id} | ${topic.names.ko} | ${version.age}세 | ${version.language === "ko" ? "한국어" : "영어"} | ${version.title}`), "",
].join("\n");

await mkdir(destination, { recursive: true });
const output = async (name, text) => writeFile(path.join(destination, name), text.endsWith("\n") ? text : `${text}\n`, "utf8");
for (const [name, selection] of [
  ["01_전체대본_80편.txt", items],
  ["02_한국어대본_40편.txt", items.filter(({ version }) => version.language === "ko")],
  ["03_영어대본_40편.txt", items.filter(({ version }) => version.language === "en")],
]) await output(name, `${header(selection)}\n${selection.map((item) => item.text).join("\n")}`);

const generated = [
  "ALICETALES 현재 클라우드 생성 대본 — 원문 보존", `추출된 저장 대본: ${snapshot.length}개`,
  "이 파일에는 현재 비공개 저장소에 남아 있는 AI 생성 결과를 수정 없이 담았습니다.",
  "학습 단어가 부자연스럽거나 뜻풀이가 틀린 경우도 원문 그대로입니다. 승인된 대본으로 취급하지 않습니다.",
  "저장되지 않았던 과거 생성 결과와 앞으로 새로 생성할 결과는 포함할 수 없습니다.",
  "캐시 파일에는 요청의 나이·주제·선택 이력이 별도로 없으므로, 그 값을 추측해 붙이지 않았습니다.",
  "무대·소품·행동 지시도 누락되지 않도록 각 대본 끝에 원본 JSON을 함께 실었습니다. 음성 바이너리와 API 키는 포함하지 않았습니다.",
  ...snapshot.flatMap((entry, index) => {
    const scene = entry.scene;
    return ["", divider, `[생성 대본 ${String(index + 1).padStart(2, "0")}]`, `저장 파일: ${entry.path}`, `저장 시각(UTC): ${entry.uploadedAt}`,
      `[해설] ${scene.narration}`, lineText(scene.lines), "[따라 말하기 카드 원문]", ...(scene.newWords ?? []).map(({ word, meaning }) => `  ${word} / ${meaning}`),
      "[다음 행동 선택지 원문]", ...(scene.choices ?? []).map((choice, i) => `  ${i + 1}. ${choice}`),
      `[이야기 종료] ${scene.lessonComplete ? "예" : "아니요"}`, "[원본 JSON 전체]", JSON.stringify(scene, null, 2)];
  }),
];
await output("04_현재_클라우드생성대본.txt", generated.join("\n"));

const guide = [
  "ALICETALES 대본 검토 안내", "", "먼저 볼 파일: 02_한국어대본_40편.txt", "",
  "01_전체대본_80편.txt: 10개 주제 × 3·4·5·6세 × 한국어·영어. 각 편의 4장면과 A/B 선택 결과를 모두 포함합니다.",
  "02_한국어대본_40편.txt: 한국어 중심 원고만 모았습니다.", "03_영어대본_40편.txt: 영어 중심 원고만 모았습니다.",
  `04_현재_클라우드생성대본.txt: 실제 저장된 생성 대본 ${snapshot.length}개를 원문 그대로 추출했습니다.`, "",
  "중요한 구분", "기존 80편은 검토용으로만 작성돼 있었고 실제 게임에 연결돼 있지 않았습니다. 현재 게임은 AI가 장면마다 대사를 새로 만듭니다.",
  "따라서 화면의 '둑', '축 늘어지다', '심심하다'를 단순히 검토 원고에서 찾거나 바꾸는 것만으로 현재 게임이 고쳐지지는 않습니다.",
  "검수한 대사와 그 대사의 음성을 한 묶음으로 준비한 뒤, 게임이 승인된 원고를 이어서 재생하도록 연결해야 합니다. 이번 작업은 검수 파일 작성까지만 진행합니다.", "",
  "화면에서 지적된 표현의 수정 방향", "- '둑 / bank': 이 장면의 핵심 표현은 '도와줄까? / Can I help?'로 둡니다. 장소 설명이 필요하면 문맥에 맞게 '물가'라고 말합니다.",
  "- '축 늘어지다': 꽃이 시든 상황이라면 '꽃이 시들었어.'처럼 실제로 말하는 문장으로 설명합니다. 따라 말할 핵심 표현은 '물 줄까?'처럼 상황에서 쓸 말로 고릅니다.",
  "- '심심하다': 상태를 말할 때는 '심심해.'라고 하고, 친구에게 함께 놀자고 할 때는 '같이 놀자!'라고 말합니다. 서로 다른 뜻의 문장을 같은 번역으로 묶지 않습니다.",
  "- '도와줄까?'는 내가 도와주겠다는 제안이고, '도와줄래?'는 상대에게 도움을 부탁하는 말입니다. 두 표현의 뜻과 말하는 역할을 구분합니다.",
  "- 저장된 생성본의 '데굴de굴 국러갔어요'는 혼합 표기와 오타입니다. '데굴데굴 굴러갔어요'로 고쳐야 합니다. 원문 파일에서는 문제를 확인할 수 있도록 그대로 보존했습니다.",
  "- 저장된 생성본에는 '발을 잡고 끌어 올려요' 같은 행동도 있습니다. 물가에서 위험한 행동을 따라 하도록 유도하는 장면은 승인 원고에 넣지 않습니다. 어린아이의 도움은 상황에 맞게 '어른께 도움을 부탁하자'처럼 씁니다.",
  "- 따라 말하기 안내: '나랑 같이 말해 볼까? “도와줄까?”'처럼 아이가 바로 쓸 수 있는 표현을 먼저 검토합니다. 안내 문장과 실제 음성도 같아야 합니다.", "",
  "검토 방법", "대본 ID와 바꾸고 싶은 줄을 알려 주시면 해당 대본을 고칠 수 있습니다. 예: KO-KINDNESS-3 / 장면 4 / 나비의 말.",
  "각 대본 끝의 승인·수정·제외 검토란은 비워 두었습니다. 아직 승인된 대본은 없습니다.", "",
  "검수 파일에만 반영한 교정 목록 (운영 원본은 변경하지 않음)",
  ...(edits.length ? edits.map((edit, i) => `${i + 1}. ${edit.language.toUpperCase()}-${edit.topic.toUpperCase()}-${edit.age} / ${edit.path}\n   전: ${edit.before}\n   후: ${edit.after}\n   이유: ${edit.reason}`) : ["교정 목록 없음"]),
];
await output("00_검토안내_및_교정목록.txt", guide.join("\n"));
await writeFile(path.join(destination, "source/reviewed-drafts.json"), `${JSON.stringify(topics, null, 2)}\n`);
console.log(JSON.stringify({ scripts: items.length, korean: 40, english: 40, scenes: 320, branchOutcomes: 160, generatedSnapshots: snapshot.length, reviewCorrections: edits.length, output: destination }));

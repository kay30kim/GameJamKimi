# 한국어 캐릭터 목소리 고르기

Node 22 이상에서 프로젝트 루트로 이동해 실행합니다. 이 도구는 API에서 실제로 사용 가능한 목소리 ID를 조회하고, 선택한 목소리로 짧은 MP3 세 개와 로컬 비교 페이지를 만듭니다. CLI는 실행한 명령 외의 샘플을 생성하거나 요금제를 구매·변경하지 않습니다.

## 1. API 키 준비

1. [Typecast API 콘솔](https://studio.typecast.ai/developers/api)에 본인 계정으로 로그인합니다.
2. 콘솔의 API 키 메뉴에서 키를 발급받습니다. Studio 구독과 API 구독·사용량은 별개입니다.
3. 프로젝트 루트의 `.env.local`에 `TYPECAST_API_KEY`를 직접 입력합니다. 기존 항목은 유지하세요. 키를 채팅·스크린샷·Git에 올리지 마세요.

```dotenv
TYPECAST_API_KEY=
TYPECAST_MODEL=ssfm-v31
```

위 빈 값에 본인의 키를 넣습니다. `TYPECAST_MODEL`은 생략하면 `ssfm-v31`이며, `ssfm-v30`도 선택할 수 있습니다. 이미 터미널 프로세스에 설정된 환경 변수는 `.env.local`보다 우선합니다. 도구는 환경 파일에 아무것도 쓰지 않습니다.

API 키 위치와 인증 방식은 [공식 TTS API 문서](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)에 안내되어 있습니다.

## 2. 실제 목소리 목록 확인

```bash
node scripts/typecast-voices.mjs list
```

선택한 모델에서 제공되는 **기본 아동 목소리**만 조회합니다. JSON 출력에서 `voice_id`, 한국어·영어 이름, 연령대, 지원 모델·감정, 미리듣기 URL을 확인합니다. 미리듣기가 없는 목소리는 `preview_url`이 `null`입니다. 조회 자체로 이 도구가 음성을 합성하지는 않습니다.

내레이터나 할머니 목소리까지 보려면:

```bash
node scripts/typecast-voices.mjs list --all
```

`--all`은 연령 필터를 없앱니다. 이 도구는 기본 제공 목소리(`voice_type=original`)를 대상으로 합니다. 목록에 있는 `voice_id`를 그대로 복사하세요. Studio 링크의 `actor_id`에 임의로 `tc_`를 붙이지 않습니다. 이름이 같아도 현재 모델과 계정에서 제공되는지 확인해야 합니다. [공식 보이스 목록 API](https://typecast.ai/docs/api-reference/voices/list-voices)

## 3. 샘플 세 개 비교

아래 `목록에서_복사한_voice_id` 부분을 실제 목록의 ID로 교체합니다.

```bash
node scripts/typecast-voices.mjs sample --voice 목록에서_복사한_voice_id
```

이 명령은 먼저 해당 ID와 모델의 지원 여부를 확인한 뒤, **API 크레딧을 사용해** 다음 세 개만 생성합니다.

1. 한국어 사과 따라 말하기 — 받침·말끝·초대하는 말투를 확인합니다.
2. “도와줄까? Can I help?”가 포함된 혼합 문장 — 한국어와 영어 사이의 발음·억양 전환을 확인합니다. 이 샘플은 언어를 고정하지 않고 자동 감지를 사용합니다.
3. 도와준 친구와 서로 기뻐하는 대사 — 선택한 모델의 해당 목소리가 `happy`를 지원하면 기쁨 감정을 사용합니다. 나머지 샘플과 기쁨 감정을 지원하지 않는 목소리는 앱과 동일한 `smart` 설정으로 문맥에 맞는 감정을 사용합니다. 페이지에 실제 설정을 표시합니다.

모든 샘플은 MP3, 피치 `0`, 속도 `0.95`입니다. 한국어 전용 두 샘플은 `language=kor`를 사용합니다. 피치를 올려 어린이처럼 만드는 보정을 하지 않습니다.

각 실행은 `tmp/voice-auditions/` 아래에 새 폴더를 만듭니다. 출력된 `index.html` 경로를 브라우저로 열면 같은 폴더의 MP3를 직접 들을 수 있습니다. 이전 비교 결과를 덮어쓰지 않습니다. API 키는 페이지에 포함되지 않으며, 페이지는 원격 리소스를 불러오지 않습니다.

다른 상위 폴더를 사용하려면:

```bash
node scripts/typecast-voices.mjs sample --voice 목록에서_복사한_voice_id --output ./tmp/another-audition
```

요청이 실패하면 자동 재시도하지 않습니다. 이미 생성된 파일은 유지되고, 비교 페이지에는 완료된 파일만 오디오 컨트롤로 표시됩니다. 다시 명령을 실행하면 새 폴더에서 세 샘플을 새로 생성하므로 크레딧이 다시 사용됩니다.

목소리의 자연스러움은 이 명령의 성공 여부로 판단하지 않습니다. 실제 대사를 듣고 발음, 캐릭터와의 어울림, 감정, 두 언어 전환을 비교한 뒤 선택하세요.

## 4. 앱의 역할별 설정

앱에는 실제 API 목록에서 확인한 캐스팅이 기본으로 들어 있습니다. `TYPECAST_API_KEY`를 설정하면 아래 목소리를 사용하며, `TYPECAST_VOICE_*`는 원하는 역할만 바꾸는 선택 항목입니다. 비어 있으면 기본 목소리를 유지합니다. 기본값과 덮어쓴 ID 모두 실제 API에서 어린이 목소리 여부와 모델 호환성을 확인한 뒤 합성합니다.

```dotenv
TYPECAST_API_KEY=
TYPECAST_MODEL=ssfm-v31
TYPECAST_VOICE_HERO=
TYPECAST_VOICE_FRIEND=
TYPECAST_VOICE_PUPPY=
TYPECAST_VOICE_KITTEN=
TYPECAST_VOICE_DUCK=
TYPECAST_VOICE_NARRATOR=
TYPECAST_VOICE_GROWNUP=
```

| 항목 | 역할 | 기본 목소리 |
| --- | --- | --- |
| `TYPECAST_VOICE_HERO` | 앨리스 | 아윤 |
| `TYPECAST_VOICE_FRIEND` | 모모 | 준우 |
| `TYPECAST_VOICE_PUPPY` | 보리 | 시우 |
| `TYPECAST_VOICE_KITTEN` | 나비 | 수아 |
| `TYPECAST_VOICE_DUCK` | 도도 | 하율 |
| `TYPECAST_VOICE_NARRATOR` | 이야기 해설 | 은경 |
| `TYPECAST_VOICE_GROWNUP` | 부엉이 할머니 | 경애 |

환경 설정 후 개발 서버를 다시 시작합니다. 비교 도구 자체는 앱의 캐스팅을 바꾸지 않습니다.

### 배포 사이트에서도 소리가 나게 하기

`.env.local`은 Git에 포함되지 않으므로 로컬 설정이 Vercel에 자동으로 옮겨지지 않습니다. Vercel 프로젝트의 **Settings → Environment Variables**에 `TYPECAST_API_KEY`를 Production·Preview 대상으로 추가한 뒤 다시 배포해야 합니다. 역할별 ID는 기본 캐스팅을 쓴다면 추가하지 않아도 됩니다. `NEXT_PUBLIC_` 접두사는 붙이지 않습니다.

로컬에서는 소리가 나는데 배포 사이트에서 `/api/tts`가 `503 TTS_NOT_CONFIGURED`를 반환한다면 먼저 해당 배포 환경의 키를 확인하세요. 호환되지 않는 역할별 ID나 모델을 설정해도 같은 코드가 반환될 수 있으므로 응답 메시지도 함께 확인합니다.

## 이용 조건과 확인 범위

2026년 11월 25일 확인한 [Typecast API 전용 약관](https://help.typecast.ai/en/articles/11872662-typecast-api-terms-of-use)은 유료 API의 적법한 상업적 앱 이용을 허용합니다. **무료 플랜으로 생성한 결과는 상업적으로 사용할 수 없으며**, 외부에 공개·배포할 때 Typecast로 생성했다는 표시가 필요합니다. 다운로드한 출력의 이용은 해당 약관을 따릅니다. 이 도구는 결제나 요금제 변경을 하지 않습니다.

[모델 문서](https://typecast.ai/docs/models)와 [API 문서](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)는 지원 언어·감정을 설명하지만 특정 대사가 자연스럽게 들린다는 보장은 하지 않습니다. 저장된 공식 미리듣기와 새로 생성한 프로젝트 대사는 따로 확인하세요.

로컬 검증:

```bash
node --test scripts/typecast-voices.test.mjs
```

테스트는 가짜 API 응답을 사용하며 실제 음성을 생성하거나 API 크레딧을 사용하지 않습니다.

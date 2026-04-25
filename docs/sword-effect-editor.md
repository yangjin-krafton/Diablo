# Sword Effect Editor Manual

Sword Effect Editor는 검 스킬의 공격 판정 범위와 시각 이펙트 모양을 브라우저에서 실시간으로 조정하는 디버그 툴입니다.

## 실행 방법

게임 페이지를 연 뒤 브라우저 개발자 도구 콘솔에서 실행합니다.

```js
diablo.openSwordEditor()
```

단축 전역 함수도 제공됩니다.

```js
openSwordEditor()
```

## 콘솔 명령

```js
diablo.openSwordEditor()
```

에디터 패널을 엽니다.

```js
diablo.closeSwordEditor()
```

에디터 패널을 닫습니다.

```js
diablo.previewSword()
```

현재 설정으로 검 스윙 이펙트를 한 번 재생합니다.

```js
diablo.swordParams()
```

현재 에디터 대상 파라미터 값을 객체로 출력합니다. 마음에 드는 값을 `src/js/config.js`에 고정할 때 사용합니다.

## 에디터 항목

### 판정 범위

- `Range`: 플레이어로부터 검이 닿는 기본 거리입니다.
- `Hit Inner`: 플레이어 가까운 쪽의 빈 공간 비율입니다. 값이 커질수록 몸 가까이 있는 적은 맞지 않습니다.
- `Hit Outer`: 칼끝 쪽 확장 비율입니다. 값이 커질수록 바깥쪽 판정이 넓어집니다.

실제 공격 판정은 반원 전체가 아니라 `Range * Hit Inner`부터 `Range * Hit Outer`까지의 띠 영역입니다. 적의 몸 반지름도 고려하므로, 중심점이 살짝 밖에 있어도 몸체가 띠에 걸치면 맞습니다.

### 이펙트 모양

- `Opacity`: 전체 이펙트 기본 투명도입니다.
- `Lift`: 지면에서 이펙트를 띄우는 높이입니다. 지형과 겹쳐 깜빡이면 조금 올립니다.
- `Slash Alpha`: 흰색 스윙 하이라이트의 투명도 배율입니다.
- `Slash Width`: 흰색 하이라이트의 각도 폭입니다.
- `Slash Sweep`: 흰색 하이라이트가 회전하며 지나가는 이동 폭입니다.
- `Trail Count`: slash 뒤를 따라오는 잔상 개수입니다.
- `Trail Delay`: 잔상이 현재 slash보다 얼마나 늦게 따라오는지 정합니다.
- `Trail Fade`: 뒤쪽 잔상이 얼마나 빠르게 흐려지는지 정합니다.
- `Trail Lift`: 잔상끼리 지면에서 살짝 떨어지는 간격입니다. 겹침 깜빡임이 보이면 조금 올립니다.
- `Pulse`: 스윙 중 이펙트가 살짝 커지는 정도입니다.

## 값 저장 방법

에디터 값은 런타임 `CONFIG`에만 반영됩니다. 새로고침하면 초기화됩니다.

1. 에디터에서 원하는 모양을 만듭니다.
2. `Copy JSON` 버튼을 누르거나 콘솔에서 실행합니다.

```js
diablo.swordParams()
```

3. 출력된 값을 `src/js/config.js`의 `CONFIG.sword`와 `CONFIG.sword.effect`에 반영합니다.

## 사용 팁

- 판정과 시각 모양을 맞추려면 `Hit Inner`, `Hit Outer`, `Slash Width`를 먼저 조정합니다.
- 실제 게임 감각은 `Hit Inner`가 너무 크면 근접한 적이 잘 안 맞고, 너무 작으면 다시 반원 전체 판정처럼 느껴집니다.
- 이펙트가 너무 강하면 `Opacity`, `Slash Alpha`, `Trail Fade` 순서로 낮춥니다.
- 스윙감이 약하면 `Slash Sweep`, `Trail Count`, `Pulse`를 조금 올립니다.

## 문제 해결

- `diablo.openSwordEditor is not a function`이 나오면 게임 로딩이 끝난 뒤 다시 실행합니다.
- 패널은 열렸지만 이펙트가 보이지 않으면 `Preview` 버튼을 누르거나 `Opacity`, `Lift` 값을 확인합니다.
- 에디터에서 바꾼 값이 파일에 저장되지 않는 것은 정상입니다. `Copy JSON` 결과를 `config.js`에 직접 반영해야 합니다.

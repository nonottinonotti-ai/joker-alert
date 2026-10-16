/* Shared schedule with device-local enable/time preferences and JST battle synchronization. */
(() => {
  const $ = id => document.getElementById(id);
  const timer = new BattleTimer();

  let alerts = [];
  let defaultAlertTimes = {};
  let ready = false;
  let busy = false;
  let started = false;
  let syncStart = null;

  const skipped = new Set();

  const preferenceKey = 'joker-enabled:v1';
  const timePreferenceKey = 'joker-alert-times:v1';

  let preferences = {};
  let timePreferences = {};

  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      preferences = value;
    }
  } catch {}

  try {
    const value = JSON.parse(localStorage.getItem(timePreferenceKey) || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      timePreferences = value;
    }
  } catch {}

  const activeSlot = (now = Date.now()) => {
    const jst = new Date(now + 9 * 3600000);
    return [12, 19, 20, 21, 22, 23].includes(jst.getUTCHours()) &&
      jst.getUTCMinutes() < 30
      ? now -
          (
            jst.getUTCMinutes() * 60000 +
            jst.getUTCSeconds() * 1000 +
            jst.getUTCMilliseconds()
          )
      : null;
  };

  function align() {
    if (syncStart === null) return;

    timer.accumulated = Math.min(
      timer.duration,
      Math.max(0, Date.now() - syncStart)
    );

    timer.startedAt = timer.now();

    alerts.forEach(a => {
      if (
        a.seconds * 1000 < timer.accumulated &&
        !timer.fired.has(a.id)
      ) {
        skipped.add(a.id);
      }
    });
  }

  const syncNote = document.createElement('p');
  syncNote.className = 'intro';
  document.querySelector('.controls').before(syncNote);

  const report = text => $('message').textContent = text;
  const audio = new AlertAudio(report);

  const format = s =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const parseTime = value => {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
    if (!match) return null;

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const total = minutes * 60 + seconds;

    if (total < 0 || total > 1800) return null;
    return total;
  };

  function saveTimePreferences() {
    try {
      localStorage.setItem(
        timePreferenceKey,
        JSON.stringify(timePreferences)
      );
      $('save-state').textContent = '時刻設定をこの端末に保存しました';
      return true;
    } catch {
      report('時刻を変更しましたが保存できません。この画面のみ有効です。');
      return false;
    }
  }

  function changeAlertTime(alert, newSeconds) {
    if (
      !Number.isInteger(newSeconds) ||
      newSeconds < 0 ||
      newSeconds > 1800
    ) {
      report('時刻は00:00〜30:00の範囲で設定してください。');
      return false;
    }

    alert.seconds = newSeconds;
    timePreferences[alert.id] = newSeconds;

    if (started) {
      if (
        alert.seconds * 1000 < timer.elapsed() &&
        !timer.fired.has(alert.id)
      ) {
        skipped.add(alert.id);
      } else {
        skipped.delete(alert.id);
      }
    }

    saveTimePreferences();
    return true;
  }

  function shiftAllAlerts(amount) {
    alerts.forEach(alert => {
      const next = Math.min(
        1800,
        Math.max(0, alert.seconds + amount)
      );

      alert.seconds = next;
      timePreferences[alert.id] = next;

      if (started) {
        if (
          alert.seconds * 1000 < timer.elapsed() &&
          !timer.fired.has(alert.id)
        ) {
          skipped.add(alert.id);
        } else {
          skipped.delete(alert.id);
        }
      }
    });

    saveTimePreferences();
    render();

    report(
      `全アラートを${amount > 0 ? '+' : ''}${amount}秒調整しました。`
    );
  }

  function shiftBattleTimer(seconds) {
    if (!started) {
      report('タイマー開始後に補正できます。');
      return;
    }

    const milliseconds = seconds * 1000;

    if (syncStart !== null) {
      syncStart -= milliseconds;

      const elapsed = Math.min(
        timer.duration,
        Math.max(0, Date.now() - syncStart)
      );

      syncStart = Date.now() - elapsed;
      timer.accumulated = elapsed;

      if (timer.running) {
        timer.startedAt = timer.now();
      }
    } else {
      timer.adjust(milliseconds);
    }

    tick();

    report(
      `今回のタイマーを${seconds > 0 ? '+' : ''}${seconds}秒補正しました。`
    );
  }

  function lock() {
    $('start').disabled =
      !ready ||
      busy ||
      timer.running ||
      timer.elapsed() >= timer.duration;

    $('pause').disabled = !timer.running || busy;
    $('reset').disabled = busy;

    $('start').textContent =
      busy ? '準備中…' : started ? '▶ RESUME' : '▶ START';

    document
      .querySelectorAll('.switch input')
      .forEach(el => el.disabled = busy);

    document.body.classList.toggle('running', timer.running);

    document
      .querySelectorAll('.preview')
      .forEach(b => b.disabled = busy || timer.running);
  }

  function update() {
    const slot = activeSlot();

    const elapsed =
      !started && slot !== null
        ? Date.now() - slot
        : timer.elapsed();

    syncNote.textContent =
      syncStart !== null
        ? '日本時間に同期中：再開時も現在時刻に合わせます。'
        : !started && slot !== null
          ? '日本時間に同期：STARTで表示中の経過時間から開始します。'
          : '通常タイマー：STARTで00:00から開始します。';

    $('elapsed').textContent = format(elapsed / 1000);
    $('progress').style.width = (elapsed / timer.duration * 100) + '%';

    document
      .querySelector('.track')
      .setAttribute('aria-valuenow', Math.floor(elapsed / 1000));

    $('state').textContent =
      !ready
        ? '設定読込待ち'
        : elapsed >= timer.duration
          ? '30分終了'
          : timer.running
            ? '進行中'
            : elapsed > 0
              ? '一時停止'
              : '待機中';

    const next = alerts
      .filter(
        a =>
          a.enabled &&
          !timer.fired.has(a.id) &&
          !skipped.has(a.id) &&
          (started || a.seconds * 1000 >= elapsed)
      )
      .sort((a, b) => a.seconds - b.seconds)[0];

    $('next-name').textContent =
      next ? next.name : '次のアラートはありません';

    $('next-time').textContent =
      next ? format(next.seconds) + ' に通知' : '';

    $('next-seconds').textContent =
      next
        ? Math.max(
            0,
            Math.ceil(next.seconds - elapsed / 1000)
          )
        : '—';
  }

  function render() {
    alerts.sort((a, b) => a.seconds - b.seconds);

    $('alerts').replaceChildren();
    $('enabled-count').textContent =
      alerts.filter(a => a.enabled).length + ' ON';

    alerts.forEach((a, i) => {
      const card = document.createElement('article');

      card.className =
        'alert-card' +
        (!a.enabled ? ' off' : '') +
        (timer.fired.has(a.id) ? ' fired' : '');

      const top = document.createElement('div');
      top.className = 'row-top';

      const num = document.createElement('span');
      num.className = 'ordinal';
      num.textContent =
        `ALERT ${String(i + 1).padStart(2, '0')}` +
        (timer.fired.has(a.id) ? ' / 発動済み' : '');

      const status = document.createElement('label');
      status.className = 'switch';

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = a.enabled;
      toggle.setAttribute('aria-label', a.name + 'の通知');

      const label = document.createElement('span');
      label.textContent = a.enabled ? 'ON' : 'OFF';

      status.append(toggle, label);
      top.append(num, status);

      if (skipped.has(a.id)) {
        num.textContent += ' / 経過済み';
      }

      toggle.addEventListener('change', () => {
        if (busy) return;

        a.enabled = toggle.checked;
        preferences[a.id] = a.enabled;

        if (
          started &&
          a.seconds * 1000 < timer.elapsed() &&
          !timer.fired.has(a.id)
        ) {
          skipped.add(a.id);
        }

        try {
          localStorage.setItem(
            preferenceKey,
            JSON.stringify(preferences)
          );

          report(
            'ON/OFFをこの端末に保存しました。他の利用者には影響しません。'
          );
        } catch {
          report(
            'ON/OFFを変更しましたが保存できません。この画面のみ有効です。'
          );
        }

        render();
      });

      const heading = document.createElement('h3');
      heading.className = 'schedule-name';

      const time = document.createElement('input');
      time.type = 'text';
      time.className = 'schedule-time schedule-time-input';
      time.value = format(a.seconds);
      time.inputMode = 'numeric';
      time.maxLength = 5;
      time.setAttribute(
        'aria-label',
        a.name + 'の通知時刻'
      );

      time.addEventListener('change', () => {
        const seconds = parseTime(time.value);

        if (seconds === null) {
          time.value = format(a.seconds);
          report(
            '時刻は「09:50」のように入力してください。'
          );
          return;
        }

        if (changeAlertTime(a, seconds)) {
          render();
          report(
            `${a.name}を${format(seconds)}に変更しました。`
          );
        }
      });

      heading.append(
        time,
        document.createTextNode(a.name)
      );

      const row = document.createElement('div');
      row.className = 'audio-row';

      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent =
        a.fileName || '端末の日本語読み上げ';

      const button = document.createElement('button');
      button.className = 'preview';
      button.textContent = '▷ 試聴';
      button.setAttribute(
        'aria-label',
        a.name + 'を試聴'
      );

      button.addEventListener('click', async () => {
        if (busy || timer.running) return;

        busy = true;
        lock();
        audio.stop();

        try {
          await audio.unlock();
          await audio.prepare([
            { ...a, enabled: true }
          ]);

          report(a.name + 'を試聴中');
          audio.enqueue(a);

        } catch (e) {
          report(e.message);

        } finally {
          busy = false;
          lock();
        }
      });

      row.append(name, button);
      card.append(top, heading, row);
      $('alerts').append(card);
    });

    if (!alerts.length) {
      $('alerts').textContent =
        '配布アラートはありません。';
    }

    lock();
    update();
  }

  function tick() {
    if (
      timer.running &&
      syncStart !== null
    ) {
      timer.accumulated = Math.min(
        timer.duration,
        Math.max(0, Date.now() - syncStart)
      );

      timer.startedAt = timer.now();
    }

    const running = timer.running;

    const due = timer.due(
      alerts.filter(
        a => !skipped.has(a.id)
      )
    );

    due.forEach(a => {
      if (timer.fired.size === due.length) {
        $('history')
          .querySelector('.empty')
          ?.remove();
      }

      const li = document.createElement('li');
      const span = document.createElement('span');

      span.textContent = format(a.seconds);

      li.append(
        span,
        document.createTextNode(a.name)
      );

      $('history').prepend(li);
      $('history-count').textContent =
        timer.fired.size;

      report(
        a.name + '：通知を発動しました。'
      );

      audio.enqueue(a);
    });

    if (due.length) render();

    if (
      running &&
      !timer.running
    ) {
      lock();

      report(
        '30分が終了しました。RESETで次の抗争を開始できます。'
      );
    }

    update();
  }

  $('start').addEventListener(
    'click',
    async () => {
      if (
        !ready ||
        busy ||
        timer.running
      ) {
        return;
      }

      busy = true;
      lock();
      audio.stop();

      try {
        await audio.unlock();

        await audio.prepare(
          alerts.map(
            a => ({ ...a, enabled: true })
          )
        );

        if (!started) {
          syncStart = activeSlot();
          started = true;
        }

        align();
        timer.start();

        report(
          'タイマーを開始しました。'
        );

      } catch (e) {
        report(e.message);

      } finally {
        busy = false;
        lock();
        tick();
      }
    }
  );

  $('pause').addEventListener(
    'click',
    () => {
      tick();
      timer.pause();
      audio.stop();
      lock();
      update();

      report(
        '一時停止しました。RESUMEで続きから再開します。'
      );
    }
  );

  $('reset').addEventListener(
    'click',
    () => {
      if (busy) return;

      timer.reset();
      started = false;
      syncStart = null;
      skipped.clear();
      audio.stop();

      $('history-count').textContent = '0';
      $('history').innerHTML =
        '<li class="empty">まだ発動したアラートはありません</li>';

      render();

      report(
        'タイマーと発動履歴をリセットしました。'
      );
    }
  );

  document
    .querySelectorAll('[data-alert-shift]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          if (busy) return;

          shiftAllAlerts(
            Number(
              button.dataset.alertShift
            )
          );
        }
      );
    });

  document
    .querySelectorAll('[data-timer-shift]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          if (busy) return;

          shiftBattleTimer(
            Number(
              button.dataset.timerShift
            )
          );
        }
      );
    });

  $('restore-alerts')
    ?.addEventListener(
      'click',
      () => {
        if (busy) return;

        timePreferences = {};

        alerts.forEach(alert => {
          const original =
            defaultAlertTimes[alert.id];

          if (
            Number.isInteger(original)
          ) {
            alert.seconds = original;
          }
        });

        try {
          localStorage.removeItem(
            timePreferenceKey
          );
        } catch {}

        skipped.clear();
        render();

        report(
          'アラート時刻を配布版の初期設定に戻しました。'
        );
      }
    );

  document.addEventListener(
    'visibilitychange',
    tick
  );

  window.addEventListener(
    'pagehide',
    () => audio.stop()
  );

  window.addEventListener(
    'beforeunload',
    e => {
      if (
        timer.elapsed() > 0 ||
        timer.running
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
  );

  window.speechSynthesis?.getVoices();

  render();

  setInterval(
    tick,
    100
  );

  /* Read once per page load. An ongoing battle never changes configuration midway. */
  (async () => {
    try {
      const response = await fetch(
        'shared-config.json?t=' + Date.now(),
        {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        throw new Error(
          'HTTP ' + response.status
        );
      }

      const text =
        await response.text();

      if (
        text.length >
        4 * 1024 * 1024
      ) {
        throw new Error(
          '容量超過'
        );
      }

      const data =
        JSON.parse(text);

      if (
        !SharedConfig.valid(data)
      ) {
        throw new Error(
          '形式不正'
        );
      }

      defaultAlertTimes =
        Object.fromEntries(
          data.alerts.map(
            a => [
              a.id,
              a.seconds
            ]
          )
        );

      alerts =
        [...data.alerts]
          .sort(
            (a, b) =>
              a.seconds - b.seconds
          )
          .map(
            a => ({
              ...a,

              seconds:
                Number.isInteger(
                  timePreferences[a.id]
                )
                  ? timePreferences[a.id]
                  : a.seconds,

              enabled:
                typeof preferences[a.id] ===
                'boolean'
                  ? preferences[a.id]
                  : a.enabled
            })
          );

      ready = true;

      $('save-state').textContent =
        '配布版：' + data.revision;

      render();

      report(
        '管理者の設定を読み込みました。試聴で音量を確認してからSTARTしてください。'
      );

    } catch {
      report(
        '配布設定を読み込めません。通信を確認して再読み込みしてください。解決しない場合は管理者に連絡してください。'
      );

      $('save-state').textContent =
        '設定の読み込みに失敗';

      lock();
    }
  })();
})();

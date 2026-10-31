/* =====================================================================
   PATS — 日曆：月曆格、當日清單、新增／編輯行程
   ===================================================================== */

var PatsCalendar = (function () {
  'use strict';

  var WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
  var cursor = new Date();
  var selected = '';
  var events = [];
  var groups = [];
  var loading = false;
  var loadToken = 0;

  function $(id) { return document.getElementById(id); }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function ymd(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseYmd(value) {
    var parts = String(value || '').split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function mondayIndex(date) {
    var day = date.getDay();
    return day === 0 ? 6 : day - 1;
  }

  function monthTitle(date) {
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月';
  }

  function dayTitle(value) {
    var date = parseYmd(value);
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
  }

  function rangeForMonth(date) {
    return {
      from: new Date(date.getFullYear(), date.getMonth(), -6).toISOString(),
      to: new Date(date.getFullYear(), date.getMonth() + 1, 8).toISOString()
    };
  }

  function eventCoversDay(ev, dayStr) {
    var start = new Date(ev.startAt);
    if (isNaN(start.getTime())) return false;
    var end = new Date(ev.endAt || ev.startAt);
    if (isNaN(end.getTime()) || end < start) end = new Date(start.getTime());
    var dayStart = parseYmd(dayStr);
    var dayEnd = new Date(dayStart.getTime() + 86400000);
    var s = start.getTime();
    var e = end.getTime();
    if (ev.allDay && e <= s) e = s + 86400000;
    return s < dayEnd.getTime() && e > dayStart.getTime();
  }

  function daysWithEvents() {
    var map = {};
    events.forEach(function (ev) {
      var start = new Date(ev.startAt);
      if (isNaN(start.getTime())) return;
      var end = new Date(ev.endAt || ev.startAt);
      if (isNaN(end.getTime()) || end < start) end = start;
      if (ev.allDay && end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + 86400000 - 1);
      }
      var cursorDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      var last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      if (end.getHours() === 0 && end.getMinutes() === 0 && end.getTime() > start.getTime()) {
        last.setDate(last.getDate() - 1);
      }
      while (cursorDay <= last) {
        map[ymd(cursorDay)] = true;
        cursorDay.setDate(cursorDay.getDate() + 1);
      }
    });
    return map;
  }

  function timeLabel(ev) {
    if (ev.allDay) return '整天';
    var start = new Date(ev.startAt);
    if (isNaN(start.getTime())) return '';
    var end = new Date(ev.endAt || ev.startAt);
    var a = pad(start.getHours()) + ':' + pad(start.getMinutes());
    if (isNaN(end.getTime()) || ev.endAt === ev.startAt) return a;
    return a + '–' + pad(end.getHours()) + ':' + pad(end.getMinutes());
  }

  function toLocalValue(iso, allDay) {
    var date = iso ? new Date(iso) : new Date();
    if (isNaN(date.getTime())) date = new Date();
    if (allDay) return ymd(date);
    return ymd(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function fromLocalValue(value, allDay) {
    if (!value) return '';
    if (allDay) {
      var date = parseYmd(value);
      return isNaN(date.getTime()) ? '' : date.toISOString();
    }
    var parsed = new Date(value);
    return isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  function iconBtn(name, title, onClick) {
    return PATS.el('button', {
      class: 'icon-btn',
      type: 'button',
      title: title,
      'aria-label': title,
      onclick: onClick
    }, [PATS.icon(name)]);
  }

  function load() {
    var token = ++loadToken;
    loading = true;
    paint();
    var range = rangeForMonth(cursor);
    return PATS.rpc('listCalendarEvents', { from: range.from, to: range.to })
      .then(function (list) {
        if (token !== loadToken) return;
        events = list || [];
      })
      .catch(function (err) {
        if (token !== loadToken) return;
        events = [];
        PATS.toast(err.message || PATS.describeError('UNKNOWN_ERROR'), 'error');
      })
      .then(function () {
        if (token !== loadToken) return;
        loading = false;
        paint();
      });
  }

  function loadGroups() {
    return PATS.rpc('listConversations', { scope: 'group' })
      .then(function (list) {
        groups = list || [];
        return groups;
      })
      .catch(function () {
        groups = [];
        return groups;
      });
  }

  function openEditor(ev) {
    return loadGroups().then(function () {
      var allDay = !!(ev && ev.allDay);
      var scopeValue = ev && ev.visibility === 'group' && ev.conversationId
        ? 'group:' + ev.conversationId
        : 'private';
      var scopeOptions = [{ value: 'private', label: '僅自己' }].concat(groups.map(function (group) {
        return {
          value: 'group:' + group.id,
          label: '分享到「' + (group.title || group.name || '群組') + '」'
        };
      }));
      PATS.openModal({
        title: ev ? '編輯行程' : '新增行程',
        fields: [
          { name: 'title', label: '標題', value: ev ? ev.title : '', placeholder: '例如：段考、社團活動' },
          {
            name: 'allDay',
            label: '時間類型',
            type: 'select',
            value: allDay ? '1' : '',
            options: [
              { value: '', label: '指定時間' },
              { value: '1', label: '整天' }
            ]
          },
          {
            name: 'startAt',
            label: '開始',
            type: allDay ? 'date' : 'datetime-local',
            value: toLocalValue(ev && ev.startAt || selected + 'T09:00', allDay)
          },
          {
            name: 'endAt',
            label: '結束',
            type: allDay ? 'date' : 'datetime-local',
            value: toLocalValue(ev && ev.endAt || selected + 'T10:00', allDay)
          },
          { name: 'notes', label: '備註', type: 'textarea', value: ev ? ev.notes : '' },
          { name: 'scope', label: '誰可以看到', type: 'select', value: scopeValue, options: scopeOptions }
        ],
        confirmText: ev ? '儲存' : '新增',
        onSubmit: function (values) {
          var isAllDay = values.allDay === '1';
          var startAt = fromLocalValue(values.startAt, isAllDay);
          var endAt = fromLocalValue(values.endAt, isAllDay) || startAt;
          var visibility = 'private';
          var conversationId = '';
          if (values.scope.indexOf('group:') === 0) {
            visibility = 'group';
            conversationId = values.scope.slice(6);
          }
          var payload = {
            title: values.title,
            notes: values.notes,
            startAt: startAt,
            endAt: endAt,
            allDay: isAllDay,
            visibility: visibility,
            conversationId: conversationId
          };
          if (ev) payload.id = ev.id;
          return PATS.rpc(ev ? 'updateCalendarEvent' : 'createCalendarEvent', payload).then(function () {
            PATS.toast(ev ? '已更新行程。' : '已新增行程。', 'success');
            return load();
          });
        }
      });
    });
  }

  function confirmDelete(ev) {
    PATS.openModal({
      title: '刪除行程',
      lead: '確定刪除「' + ev.title + '」？刪除後無法復原。',
      confirmText: '刪除',
      onSubmit: function () {
        return PATS.rpc('deleteCalendarEvent', { id: ev.id }).then(function () {
          PATS.toast('已刪除行程。', 'success');
          return load();
        });
      }
    });
  }

  function openEvent(ev) {
    if (ev.canEdit) {
      PATS.openMenu(document.getElementById('cal-add') || document.body, [
        { label: '編輯', icon: 'edit_square', onSelect: function () { openEditor(ev); } },
        { label: '刪除', icon: 'delete_sweep', tone: 'danger', onSelect: function () { confirmDelete(ev); } }
      ]);
      return;
    }
    PATS.openModal({
      title: ev.title,
      lead: timeLabel(ev) + (ev.conversationName ? '\n' + ev.conversationName : '') +
        (ev.notes ? '\n\n' + ev.notes : '\n\n（僅供檢視）'),
      confirmText: '關閉',
      onSubmit: function () {}
    });
  }

  function paintGrid() {
    var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    var start = new Date(first);
    start.setDate(first.getDate() - mondayIndex(first));
    var today = ymd(new Date());
    var dots = daysWithEvents();
    var cells = [];
    for (var i = 0; i < 42; i++) {
      var date = new Date(start);
      date.setDate(start.getDate() + i);
      var key = ymd(date);
      var muted = date.getMonth() !== cursor.getMonth();
      cells.push(PATS.el('button', {
        class: 'cal-day' +
          (muted ? ' is-muted' : '') +
          (key === today ? ' is-today' : '') +
          (key === selected ? ' is-selected' : ''),
        type: 'button',
        onclick: (function (day) {
          return function () {
            selected = day;
            paint();
          };
        })(key)
      }, [
        PATS.el('span', { text: String(date.getDate()) }),
        dots[key] ? PATS.el('span', { class: 'cal-dot', 'aria-hidden': 'true' }) : null
      ]));
    }
    return cells;
  }

  function eventsOnSelectedDay() {
    return events.filter(function (ev) { return eventCoversDay(ev, selected); });
  }

  function paintList() {
    return eventsOnSelectedDay().map(function (ev) {
      return PATS.el('button', {
        class: 'cal-item',
        type: 'button',
        onclick: function () { openEvent(ev); }
      }, [
        PATS.el('div', { class: 'cal-item-time', text: timeLabel(ev) }),
        PATS.el('div', { class: 'cal-item-body' }, [
          PATS.el('div', { class: 'cal-item-title', text: ev.title }),
          PATS.el('div', { class: 'cal-item-meta' }, [
            PATS.el('span', {
              class: 'cal-chip' + (ev.visibility === 'group' ? '' : ' is-private'),
              text: ev.visibility === 'group' ? (ev.conversationName || '群組') : '私人'
            }),
            ev.createdByName && !ev.canEdit
              ? PATS.el('span', { text: ev.createdByName })
              : null
          ])
        ])
      ]);
    });
  }

  function paint() {
    var pane = $('calendar-pane');
    if (!pane) return;
    if (!selected) selected = ymd(new Date());
    pane.innerHTML = '';
    pane.appendChild(PATS.el('div', { class: 'cal-inner' }, [
      PATS.el('div', { class: 'cal-toolbar' }, [
        PATS.el('h2', { text: monthTitle(cursor) }),
        PATS.el('div', { class: 'cal-nav' }, [
          iconBtn('chevron_left', '上個月', function () {
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
            load();
          }),
          PATS.el('button', {
            class: 'btn btn-ghost',
            type: 'button',
            text: '今天',
            onclick: function () {
              var now = new Date();
              cursor = new Date(now.getFullYear(), now.getMonth(), 1);
              selected = ymd(now);
              load();
            }
          }),
          iconBtn('chevron_right', '下個月', function () {
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            load();
          }),
          PATS.el('button', {
            class: 'btn btn-primary',
            type: 'button',
            id: 'cal-add',
            onclick: function () { openEditor(null); }
          }, [PATS.icon('add'), PATS.el('span', { text: '新增' })])
        ])
      ]),
      PATS.el('div', { class: 'cal-weekdays' }, WEEKDAYS.map(function (label) {
        return PATS.el('span', { text: label });
      })),
      PATS.el('div', { class: 'cal-grid' }, paintGrid()),
      loading
        ? PATS.el('div', { class: 'cal-status', text: '載入行程中…' })
        : (eventsOnSelectedDay().length
          ? PATS.el('div', { class: 'cal-day-block' }, [
              PATS.el('div', { class: 'cal-day-head' }, [
                PATS.el('h3', { text: dayTitle(selected) })
              ]),
              PATS.el('div', { class: 'cal-list' }, paintList())
            ])
          : null)
    ]));
  }

  function render() {
    if (!selected) selected = ymd(new Date());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    load();
  }

  return { render: render };
})();

import type { LineMdIconName } from '../icons/lineMd';

export const landingFeatures: {
  title: string;
  icon: LineMdIconName;
  text: string;
}[] = [
  {
    title: 'Расписание',
    icon: 'calendar',
    text: 'Гибкое расписание недели, фокус-день и статусы уроков.',
  },
  {
    title: 'Студенты',
    icon: 'account',
    text: 'Учёт учеников, баланса, пополнений и заметок без лишней суеты.',
  },
  {
    title: 'Оплаты',
    icon: 'clipboard-list',
    text: 'Журнал операций с привязкой к ученику и периоду.',
  },
  {
    title: 'Налоги',
    icon: 'document-report',
    text: 'Доход по месяцам — просто и понятно с автоматическим подсчётом налогов.',
  },
  {
    title: 'Аналитика',
    icon: 'list-3',
    text: 'Доход, статусы занятий и финансовые показатели.',
  },
  {
    title: 'Настройки',
    icon: 'cog',
    text: 'Настройте LeO под свой формат работы: неделя, академический час, пополнения, архив и налоги.',
  },
  {
    title: 'Telegram-бот',
    icon: 'watch',
    text: 'Расписание, баланс, долги и напоминания в мессенджере — для репетитора и ученика.',
  },
];

export const landingBalanceRows = [
  {
    initials: 'МД',
    gradient: 'linear-gradient(150deg,#6d8fd8,#3f5fae)',
    name: 'Мария Дрозд',
    sub: 'IELTS · предоплата',
    badge: '+€150',
    badgeClass: 'bbadge--credit',
    meterClass: 'bmeter__credit',
    meterWidth: '100%',
  },
  {
    initials: 'ТА',
    gradient: 'linear-gradient(150deg,#d89a6d,#b5713f)',
    name: 'Тимур Алиев',
    sub: '2 урока не оплачены',
    badge: '−4 000 ₽',
    badgeClass: 'bbadge--debt',
    meterClass: 'bmeter__debt',
    meterWidth: '62%',
  },
  {
    initials: 'ЛС',
    gradient: 'linear-gradient(150deg,#74c79a,#3f9e6e)',
    name: 'Лена Сафина',
    sub: 'Баланс нулевой',
    badge: '€0',
    badgeClass: 'bbadge--zero',
    meterClass: '',
    meterWidth: '0%',
  },
] as const;

export const landingSteps = [
  {
    title: 'Добавьте учеников',
    text: 'Имя, ставка, валюта и часовой пояс. Для групп — список участников. Пара минут на каждого.',
  },
  {
    title: 'Поставьте занятия',
    text: 'Расставьте уроки в календаре и повторяйте их по неделям. Видеоссылка добавляется сюда же.',
  },
  {
    title: 'Отмечайте оплаты',
    text: 'После урока — статус и оплата в один клик. Баланс и долги считаются за вас.',
  },
] as const;

export const landingPricing = {
  kicker: 'Цены',
  title: 'Простые тарифы без сюрпризов',
  subtitle:
    'На период общего тестирования все тарифы бесплатны — зачёркнутые цены действуют после запуска.',
  testLabel: 'Бесплатно на период общего тестирования',
  freeForeverLabel: 'Навсегда бесплатно',
  comingSoonLabel: 'Скоро',
} as const;

export const landingPlans = [
  {
    name: 'Старт',
    freeForever: true,
    desc: 'Для тех, кто только начинает вести учёт.',
    popular: false,
    cta: 'Начать',
    ctaVariant: 'ghost' as const,
    features: ['До 5 учеников', 'Расписание и оплаты', 'Баланс и долги'],
  },
  {
    name: 'Репетитор',
    price: 'от 2.95 USD',
    period: ' / мес',
    desc: 'Для активной частной практики.',
    popular: true,
    cta: 'Начать бесплатно',
    ctaVariant: 'primary' as const,
    features: [
      'Без лимита учеников',
      'Группы и абонементы',
      'Налоги и аналитика дохода',
      'Google Calendar — скоро',
      'Telegram-бот и уведомления',
    ],
  },
  {
    name: 'Школа',
    comingSoon: true,
    desc: 'Для команды преподавателей.',
    popular: false,
    features: ['Несколько репетиторов', 'Общая база учеников', 'Сводная аналитика'],
  },
] as const;

export const landingHeroChips = [
  { text: 'Предоплата и долг наглядно', dot: 'green' },
  { text: '1-на-1 и мини-группы', dot: 'blue' },
  { text: 'Google Calendar — скоро', dot: 'amber' },
  { text: 'Telegram-бот', dot: 'green' },
] as const;

export const landingHeroPills = [
  { time: '16:00', name: 'Мария', subject: 'Математика', badge: '+3 урока', badgeClass: 'lpill__badge--up' },
  { time: '18:30', name: 'Тимур', subject: 'Английский', badge: '−1 урок', badgeClass: 'lpill__badge--down' },
] as const;

export const landingPreviewLessons = [
  { time: '09:00', bar: '#6d8fd8', title: 'Мария · IELTS', sub: 'Индивидуально · 1 ч', paid: true },
  { time: '15:00', bar: '#b07fd0', title: 'Группа A2', sub: '3 ученика · 1,5 ч', paid: true },
  { time: '17:00', bar: '#d89a6d', title: 'Тимур', sub: 'Английский · 1 ч', paid: false },
] as const;

export const landingBalanceBullets = [
  {
    title: 'Предоплата и абонементы.',
    text: 'Ученик платит вперёд — занятия списываются автоматически.',
  },
  {
    title: 'Долги под контролем.',
    text: 'Сразу видно, кто и на сколько занятий ушёл в минус.',
  },
  {
    title: 'Любая валюта и ставка.',
    text: '€, ₽ и другие — для каждого ученика своя цена урока.',
  },
] as const;

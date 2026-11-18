import { nextBerlinMidnightOf } from '#shared/game/daily';
import { useGameStore } from '~/stores/game';

const secondMs = 1000;

export const useNextDailyCountdown = () => {
  const { t } = useI18n();
  const game = useGameStore();
  const now = shallowRef(new Date());
  useIntervalFn(() => {
    now.value = new Date();
  }, secondMs);

  let nextDailyAt = nextBerlinMidnightOf(now.value.getTime());

  const remainingSeconds = ref(Math.ceil((nextDailyAt - now.value.getTime()) / secondMs));

  watch(now, (moment) => {
    if (moment.getTime() >= nextDailyAt) {
      nextDailyAt = nextBerlinMidnightOf(moment.getTime());
      game.refreshDaily();
    }
    remainingSeconds.value = Math.ceil((nextDailyAt - moment.getTime()) / secondMs);
  });

  const shown = computed(() => {
    const hours = Math.floor(remainingSeconds.value / 3600);
    const minutes = Math.floor(remainingSeconds.value / 60) % 60;
    const seconds = remainingSeconds.value % 60;
    return [hours, minutes, seconds].map(part => String(part).padStart(2, '0')).join(':');
  });

  const spoken = computed(() => {
    const hours = Math.floor(remainingSeconds.value / 3600);
    const minutes = Math.floor(remainingSeconds.value / 60) % 60;
    return `${t('daily.hours', { count: hours }, hours)} ${t('record.minutes', { count: minutes }, minutes)}`;
  });

  return { now, shown, spoken };
};

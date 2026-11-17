export const useDurationText = () => {
  const { t } = useI18n();

  return (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const spokenSeconds = t('record.seconds', { count: seconds }, seconds);
    return {
      shown: `${minutes}:${String(seconds).padStart(2, '0')}`,
      spoken: minutes ? `${t('record.minutes', { count: minutes }, minutes)} ${spokenSeconds}` : spokenSeconds,
    };
  };
};

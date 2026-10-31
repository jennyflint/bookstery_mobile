export const useCounterStore = defineStore('counter', () => {
  const count = ref<number>(0);
  const isEven = computed<boolean>(() => count.value % 2 === 0);

  const increment = (): void => {
    count.value += 1;
  };

  return { count, isEven, increment };
});

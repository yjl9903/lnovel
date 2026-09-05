import { createStore } from '@tanstack/store';

export const createHomeStore = () => createStore({ activeIndex: 0 });

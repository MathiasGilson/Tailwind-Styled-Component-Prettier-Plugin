**⚠️⚠️⚠️ WIP not fonctional ⚠️⚠️⚠️**

A [Prettier](https://prettier.io/) plugin for Tailwind Styled Component that automatically sorts classes based on [Tailwind recommended class order](https://tailwindcss.com/blog/automatic-class-sorting-with-prettier#how-classes-are-sorted) and based on class groups

Go from infinite line mess 🤮

```tsx
  <div
      className={"flex flex-col items-center justify-center bg-red-500 hover:bg-indigo-700 rounded-md border border-transparent w-full px-8 py-3 md:py-4 md:px-10 text-center text-base font-medium text-white md:text-lg"}
  >
      Hello
  </div>

```

👇👇👇

To clean structured classes **Automatically** ✨

```tsx
  <div
      className={classNames(
          BUTTON_CLASSES, // inherit classes with auto merge and conflict resolution
          
          // classes are sorted by categories for a cleaner look
          // the order of the categories stays the same
          // the order of the classes follows tailwind recommendations
          "flex flex-col items-center justify-center",
          "bg-red-500 hover:bg-indigo-700",
          "rounded-md border border-transparent",
          "w-full",
          "px-8 py-3 md:py-4 md:px-10",
          "text-center text-base font-medium text-white md:text-lg",
          
          blue && `text-blue-400` // clear conditional classes (only one per line)
      )}
  >
      Hello
  </div>

```




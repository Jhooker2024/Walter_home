module.exports = {
  content: [
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        walterPurple: "#4840BB",
        walterPeach: "#F7E9E2",
        walterBlack: "#111827",
        walterChatBg: "#DADEF1",
      }
    },
  },
  plugins: [],
};

// ======================================
//  Sign In
// ======================================
export const SignInSchema = {
  type: "object",
  description:
    "Send a friendly localized message inviting the user to sign in to Ringee. " +
    "Used when the user already has an account and wants to access call or contact features.",
  properties: {
    signInText: {
      type: "string",
      description:
        "Localized message inviting the user to sign in. " +
        "Mention that signing in unlocks access to international calls, call history, and contacts. " +
        "Default language: English. Auto-translate based on user's message language.",
    },
  },
  required: ["signInText"],
  additionalProperties: false,
};

// ======================================
//  Sign Up
// ======================================
export const SignUpSchema = {
  type: "object",
  description:
    "Send a friendly localized message inviting the user to sign up to Ringee. " +
    "Used when the user is new and wants to create an account before making calls.",
  properties: {
    signUpText: {
      type: "string",
      description:
        "Localized text inviting the user to create a free Ringee account. " +
        "Mention that signup allows making affordable international calls via WhatsApp. " +
        "Default language: English. Auto-translate based on user's message language.",
    },
  },
  required: ["signUpText"],
  additionalProperties: false,
};

// ======================================
//  Welcome (Not Logged In)
// ======================================
export const WelcomeNotLoggedInSchema = {
  type: "object",
  description:
    "Display a warm welcome message for users who are not logged in yet. " +
    "Includes localized call-to-action buttons for Sign In and Sign Up. " +
    "This is the entry point for first-time users in WhatsApp.",
  properties: {
    signInText: {
      type: "string",
      description: "Text label for the 'Sign In' button.",
    },
    signUpText: {
      type: "string",
      description: "Text label for the 'Sign Up' button.",
    },
    headerText: {
      type: "string",
      description: "Short title welcoming the user to Ringee.",
    },
    bodyText: {
      type: "string",
      description:
        "Localized body text introducing Ringee — explain briefly that it's a service for making low-cost international calls directly from WhatsApp.",
    },
    footerText: {
      type: "string",
      description:
        "Footer note shown below buttons. Can contain small tips or greetings like 'Powered by Ringee.co'.",
    },
  },
  required: [
    "signInText",
    "signUpText",
    "headerText",
    "bodyText",
    "footerText",
  ],
  additionalProperties: false,
};

// ======================================
//  Show Menu
// ======================================
export const ShowMenuSchema = {
  type: "object",
  description:
    "Display the main interactive menu inside WhatsApp. " +
    "Used to help users navigate through Ringee’s main actions such as making calls, viewing history, and managing contacts.",
  properties: {
    headerText: {
      type: "string",
      description:
        "Title shown at the top of the menu, e.g. 'Main Menu' or 'Your Ringee Dashboard'.",
    },
    bodyText: {
      type: "string",
      description:
        "Short description guiding the user to choose what they want to do next.",
    },
    footerText: {
      type: "string",
      description:
        "Footer text below the menu. Example: 'Ringee – Connecting people worldwide.'",
    },
    buttonText: {
      type: "string",
      description:
        "Label for the button that expands the menu list. Example: 'View Options'.",
    },
    menu: {
      type: "array",
      description:
        "Array of menu sections, each containing a title and a list of available options. " +
        "Ringee menus should focus on convenience and clarity.",
      items: {
        type: "object",
        description: "A menu section grouping related options.",
        properties: {
          title: {
            type: "string",
            description:
              "Title of the menu section (e.g. 'Calls', 'Contacts').",
          },
          options: {
            type: "array",
            description: "Array of available options under this section.",
            items: {
              type: "object",
              description: "A single actionable option within the menu.",
              properties: {
                id: {
                  type: "string",
                  description:
                    "Unique ID for the option. Used for tracking user selection.",
                },
                title: {
                  type: "string",
                  description:
                    "Visible text for the option (e.g. 'Make a Call').",
                },
                description: {
                  type: "string",
                  description:
                    "Optional short explanation or hint below the title.",
                },
              },
              required: ["id", "title", "description"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["headerText", "bodyText", "footerText", "buttonText", "menu"],
  additionalProperties: false,
};

// ======================================
//  Welcome (with Menu)
// ======================================
export const WelcomeSchema = {
  type: "object",
  description:
    "Display a personalized welcome message for logged-in users, followed by the main menu of quick actions. " +
    "This is typically the first interaction after authentication.",
  properties: {
    welcomeText: {
      type: "string",
      description:
        "Localized greeting message for the user. " +
        "Example: 'Welcome back to Ringee! What would you like to do today?'",
    },
    menu: ShowMenuSchema,
  },
  required: ["welcomeText", "menu"],
  additionalProperties: false,
};

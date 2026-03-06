export class ChatWelcomeNotLoggedInDto {
  signInText!: string;
  signUpText!: string;
  headerText!: string;
  bodyText!: string;
  footerText?: string;
}

export class ChatMenu {
  title!: string;
  options!: {
    title: string;
    id: string;
    description?: string;
  }[];
}

export class ShowMenuDto {
  headerText!: string;
  bodyText!: string;
  buttonText!: string;
  footerText?: string;
  menu!: ChatMenu[];
}

export class ChatWelcomeDto {
  welcomeText!: string;
  menu!: ShowMenuDto;
}

export class ChatSignInDto {
  signInText!: string;
}

export class ChatSignUpDto {
  signUpText!: string;
}

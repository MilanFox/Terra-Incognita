type UIButtonColor = 'grey' | 'green' | 'blue' | 'orange';

type UIButtonBaseProps = {
  color?: UIButtonColor
};

type UIButtonButtonProps = UIButtonBaseProps & {
  type?: 'button'
};

type UIButtonLinkProps = UIButtonBaseProps & {
  type: 'link'
  to: string
};

export type UIButtonProps = UIButtonButtonProps | UIButtonLinkProps;

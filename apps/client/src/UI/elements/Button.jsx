import { forwardRef } from 'react';
import styles from './Button.module.scss';

/** `primary`: the one main action on a screen (stencil type, blaze orange). `quiet`: small helpers like Copy.
 *  With `href` it's a link that looks like the button. */
const Button = forwardRef(function Button({ variant = 'primary', type = 'button', className = '', ...props }, ref) {
  const classes = `${styles.button} ${styles[variant]} ${className}`;
  if (props.href) return <a ref={ref} className={classes} {...props} />;
  return <button ref={ref} type={type} className={classes} {...props} />;
});

export default Button;

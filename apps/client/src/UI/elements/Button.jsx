import { forwardRef } from 'react';
import styles from './Button.module.scss';

/** `primary`: the one main action on a screen (stencil type, blaze orange). `quiet`: small helpers like Copy. */
const Button = forwardRef(function Button({ variant = 'primary', type = 'button', className = '', ...props }, ref) {
  return <button ref={ref} type={type} className={`${styles.button} ${styles[variant]} ${className}`} {...props} />;
});

export default Button;

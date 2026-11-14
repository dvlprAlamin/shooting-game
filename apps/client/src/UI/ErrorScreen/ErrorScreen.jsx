import { Component } from 'react';
import { hideSplash } from '@/splash';
import Button from '../elements/Button';
import styles from './ErrorScreen.module.scss';

/** Around the whole game: if rendering fails, a screen with a Reload button instead of a blank page. The error is
 *  reported by the React root (main.tsx), which sees every error boundary's. */
class ErrorScreen extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    hideSplash(); // it may have failed before the menu was up
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={styles.screen} role="alert">
        <div className={styles.card}>
          <h1 className={styles.title}>Something broke</h1>
          <p className={styles.text}>RimFire hit an error it can't recover from. Reloading starts it again.</p>
          <Button className={styles.reload} onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}

export default ErrorScreen;

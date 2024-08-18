import React from 'react';
import './button.scss';
const Button = ({ text = 'Click Here', onClick }) => {
  return (
    <button onClick={onClick} className="button-82-pushable" role="button">
      <span className="button-82-shadow"></span>
      <span className="button-82-edge"></span>
      <span className="button-82-front text">{text}</span>
    </button>
  );
};

export default Button;

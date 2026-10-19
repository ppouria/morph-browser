import React from 'react';

const logo = (file) => (
  <img className="pm-kernel-icon" src={`./icons/${file}`} alt="" width={18} height={18} />
);

// Official logos of the browsers each kernel ships. Forks without their own mark use the
// Chromium logo, which is what they are built from.
export const KERNEL_ICONS = {
  chrome: logo('chrome.svg'),
  cft: logo('chrome.svg'),
  chromium: logo('chromium.png'),
  ungoogled: logo('chromium.png'),
  fingerprint: logo('chromium.png'),
  brave: logo('brave.svg'),
  thorium: logo('thorium.png'),
  firefox: logo('firefox.svg'),
};

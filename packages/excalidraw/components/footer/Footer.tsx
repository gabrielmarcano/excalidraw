import clsx from "clsx";

import { actionToggleZenMode } from "../../actions";
import { useTunnels } from "../../context/tunnels";
import { t } from "../../i18n";
import { UndoRedoActions, ZoomActions } from "../Actions";
import { useApp } from "../App";
import { IconButton } from "../IconButton";
import { Section } from "../Section";
import Stack from "../Stack";
import { coffeeIcon } from "../icons";

import type { ActionManager } from "../../actions/manager";
import type { UIAppState } from "../../types";

const Footer = ({
  appState,
  actionManager,
  renderWelcomeScreen,
  defaultUIEnabled,
  zoomUIEnabled,
}: {
  appState: UIAppState;
  actionManager: ActionManager;
  renderWelcomeScreen: boolean;
  defaultUIEnabled: boolean;
  zoomUIEnabled: boolean;
}) => {
  const { FooterCenterTunnel, WelcomeScreenHelpHintTunnel } = useTunnels();
  const app = useApp();

  return (
    <footer
      role="contentinfo"
      className="layer-ui__wrapper__footer App-menu App-menu_bottom"
    >
      {(defaultUIEnabled || (zoomUIEnabled && app.isNavigationEnabled())) && (
        <div
          className={clsx(
            "layer-ui__wrapper__footer-left zen-mode-transition",
            {
              "layer-ui__wrapper__footer-left--transition-left":
                appState.zenModeEnabled,
            },
          )}
        >
          <Stack.Col gap={2}>
            <Section heading="canvasActions">
              {zoomUIEnabled && app.isNavigationEnabled() && (
                <ZoomActions renderAction={actionManager.renderAction} />
              )}

              {defaultUIEnabled && !appState.viewModeEnabled && (
                <UndoRedoActions
                  renderAction={actionManager.renderAction}
                  className={clsx("zen-mode-transition", {
                    "layer-ui__wrapper__footer-left--transition-bottom":
                      appState.zenModeEnabled,
                  })}
                />
              )}
            </Section>
          </Stack.Col>
        </div>
      )}
      <FooterCenterTunnel.Out />
      {(defaultUIEnabled || renderWelcomeScreen) && (
        <div className="layer-ui__wrapper__footer-right">
          <div style={{ position: "relative" }}>
            {renderWelcomeScreen && <WelcomeScreenHelpHintTunnel.Out />}
          </div>
        </div>
      )}
      {defaultUIEnabled && (
        <IconButton
          type="toggle"
          icon={coffeeIcon}
          checked={appState.zenModeEnabled}
          title={t("buttons.zenMode")}
          aria-label={t("buttons.zenMode")}
          data-testid="zen-mode-toggle"
          className="zen-mode-toggle"
          onSelect={() => actionManager.executeAction(actionToggleZenMode)}
        />
      )}
    </footer>
  );
};

export default Footer;
Footer.displayName = "Footer";

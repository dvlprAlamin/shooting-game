import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {

    // The app's own plugins (npm plugins register themselves).
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LanPlugin())
    }
}

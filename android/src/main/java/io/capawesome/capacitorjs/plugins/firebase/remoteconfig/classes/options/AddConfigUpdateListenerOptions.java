package io.capawesome.capacitorjs.plugins.firebase.remoteconfig.classes.options;

public class AddConfigUpdateListenerOptions {

    private String callbackId;

    public AddConfigUpdateListenerOptions(String callbackId) {
        this.callbackId = callbackId;
    }

    public String getCallbackId() {
        return callbackId;
    }
}
